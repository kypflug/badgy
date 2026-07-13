/**
 * Client auth via the token-mediating BFF. Long-lived refresh tokens stay server-side; the
 * browser holds only an HttpOnly session cookie and short-lived Graph access tokens.
 */

export const AUTH_INTERACTION_REQUIRED = 'auth_interaction_required';
const AUTH_WINDOW_NAME = 'badgy-microsoft-auth';
const POLL_INTERVAL_MS = 1_000;
const CLAIM_RESUME_GRACE_MS = 30 * 60_000;
const START_RETRIES_MS = [0, 350, 1_000] as const;

export interface AuthAccount {
  id: string;
  name: string;
  email: string;
}

export type AuthInitResult =
  | { status: 'signed-in'; account: AuthAccount }
  | { status: 'signed-out'; reason: string }
  | { status: 'unavailable' };

export type AuthFlowStage = 'starting' | 'blocked' | 'waiting' | 'complete' | 'failed';

export interface AuthFlowSnapshot {
  stage: AuthFlowStage;
  error: string | null;
}

interface StartResponse {
  transactionId: string;
  pollSecret: string;
  authorizationUrl: string;
  expiresAt: string;
}

interface ErrorResponse {
  error?: string;
}

interface CompleteResponse {
  status: 'pending' | 'complete' | 'failed' | 'expired' | 'invalid' | 'error';
  account?: AuthAccount;
  error?: string;
}

export class AuthUnavailableError extends Error {
  constructor(message = 'auth_unavailable') {
    super(message);
    this.name = 'AuthUnavailableError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function responseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Resolve the BFF session without turning temporary service failures into a signed-out state. */
export async function initAuth(): Promise<AuthInitResult> {
  for (let attempt = 0; attempt < START_RETRIES_MS.length; attempt++) {
    const delay = START_RETRIES_MS[attempt];
    if (delay > 0) await sleep(delay);
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 401) {
        const data = await responseJson<{ error?: string }>(response);
        return { status: 'signed-out', reason: data?.error ?? 'signed_out' };
      }
      if (!response.ok) {
        if (response.status >= 500) continue;
        return { status: 'signed-out', reason: `auth_${response.status}` };
      }
      const data = await responseJson<{
        signedIn: boolean;
        id: string;
        name: string;
        email: string;
      }>(response);
      if (!data?.signedIn) return { status: 'signed-out', reason: 'signed_out' };
      const account = { id: data.id, name: data.name, email: data.email };
      return { status: 'signed-in', account };
    } catch {
      // Retry below; the dock app can still open its local cache after all retries fail.
    }
  }
  return { status: 'unavailable' };
}

export class InteractiveAuthFlow extends EventTarget {
  snapshot: AuthFlowSnapshot = { stage: 'starting', error: null };
  readonly completion: Promise<AuthAccount>;

  private popup: Window | null = null;
  private authorizationUrl: string | null = null;

  constructor(private readonly selectAccount: boolean) {
    super();
    this.popup = this.openWindow();
    this.completion = this.run();
  }

  /** Retry opening Microsoft from a fresh user gesture after Safari blocks the initial popup. */
  openMicrosoft(): boolean {
    this.popup = this.openWindow(this.authorizationUrl ?? undefined);
    if (!this.popup) {
      this.setSnapshot('blocked', null);
      return false;
    }
    if (this.authorizationUrl) this.setSnapshot('waiting', null);
    return true;
  }

  private openWindow(url = ''): Window | null {
    const popup = window.open(
      url,
      AUTH_WINDOW_NAME,
      'popup=yes,width=620,height=760,resizable=yes,scrollbars=yes',
    );
    if (popup && !url) {
      try {
        popup.document.title = 'Opening Microsoft sign-in…';
        popup.document.body.textContent = 'Opening Microsoft sign-in…';
      } catch {
        // The window may already have crossed into a separate Safari context.
      }
    }
    return popup;
  }

  private setSnapshot(stage: AuthFlowStage, error: string | null): void {
    this.snapshot = { stage, error };
    this.dispatchEvent(new Event('change'));
  }

  private async run(): Promise<AuthAccount> {
    try {
      const startResponse = await fetch('/api/auth/start', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-requested-with': 'badgy',
        },
        body: JSON.stringify({ selectAccount: this.selectAccount }),
      });
      const start = await responseJson<StartResponse & ErrorResponse>(startResponse);
      if (!startResponse.ok || !start) throw new Error(start?.error ?? 'auth_start_failed');

      this.authorizationUrl = start.authorizationUrl;
      if (this.popup && !this.popup.closed) {
        this.popup.location.replace(start.authorizationUrl);
        this.setSnapshot('waiting', null);
      } else {
        this.popup = null;
        this.setSnapshot('blocked', null);
      }

      const authorizationExpiresAt = new Date(start.expiresAt).getTime();
      if (!Number.isFinite(authorizationExpiresAt)) throw new Error('auth_invalid_expiry');
      const pollUntil = authorizationExpiresAt + CLAIM_RESUME_GRACE_MS;
      while (Date.now() < pollUntil) {
        await sleep(POLL_INTERVAL_MS);
        if (this.popup?.closed && this.snapshot.stage === 'waiting') {
          this.popup = null;
          this.setSnapshot('blocked', null);
        }
        let response: Response;
        try {
          response = await fetch('/api/auth/complete', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'content-type': 'application/json',
              'x-requested-with': 'badgy',
            },
            body: JSON.stringify({
              transactionId: start.transactionId,
              pollSecret: start.pollSecret,
            }),
          });
        } catch {
          continue;
        }

        const result = await responseJson<CompleteResponse>(response);
        if (response.status === 202 || result?.status === 'pending') continue;
        if (response.ok && result?.status === 'complete' && result.account) {
          this.setSnapshot('complete', null);
          if (this.popup && !this.popup.closed) this.popup.close();
          return result.account;
        }
        if (response.status >= 500) continue;
        throw new Error(result?.error ?? `auth_complete_${response.status}`);
      }
      throw new Error('auth_expired');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'auth_failed';
      this.setSnapshot('failed', message);
      if (this.popup && !this.popup.closed) this.popup.close();
      throw error;
    }
  }
}

let activeFlow: InteractiveAuthFlow | null = null;

export function startInteractiveAuth(selectAccount = false): InteractiveAuthFlow {
  if (activeFlow) return activeFlow;
  const flow = new InteractiveAuthFlow(selectAccount);
  activeFlow = flow;
  void flow.completion
    .finally(() => {
      if (activeFlow === flow) activeFlow = null;
    })
    .catch(() => undefined);
  return flow;
}

export function signIn(): InteractiveAuthFlow {
  return startInteractiveAuth(false);
}

export function reconnect(): InteractiveAuthFlow {
  return startInteractiveAuth(false);
}

export function switchAccount(): InteractiveAuthFlow {
  return startInteractiveAuth(true);
}

export async function signOut(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (!response.ok) return false;
    window.location.assign('/');
    return true;
  } catch {
    return false;
  }
}

let cached: { token: string; exp: number } | null = null;

/** A Graph access token brokered by the BFF, cached client-side until ~1 min before expiry. */
export async function getGraphToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.exp - 60_000 > now) return cached.token;
  const response = await fetch('/api/token', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'x-requested-with': 'badgy' },
  });
  if (response.status === 401 || response.status === 403) {
    cached = null;
    throw new Error(AUTH_INTERACTION_REQUIRED);
  }
  if (!response.ok) throw new AuthUnavailableError(`token_${response.status}`);
  const data = (await response.json()) as { accessToken: string; expiresOn: string | null };
  cached = {
    token: data.accessToken,
    exp: data.expiresOn ? new Date(data.expiresOn).getTime() : now + 50 * 60_000,
  };
  return data.accessToken;
}
