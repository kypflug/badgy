import type { AccessToken, AuthProvider, ProviderAccount } from './types';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.appdata',
] as const;

type FetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: URLSearchParams },
) => Promise<FetchResponse>;

interface GoogleCache {
  v: 1;
  refreshToken: string;
  sub: string;
  email: string;
  name: string;
}

interface TokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
  refresh_token?: unknown;
  id_token?: unknown;
  error?: unknown;
  error_description?: unknown;
}

export class GoogleOAuthError extends Error {
  constructor(
    public readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = 'GoogleOAuthError';
  }
}

function config(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured');
  return { clientId, clientSecret };
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new GoogleOAuthError('bad_token', 'Malformed Google token response');
  return value as Record<string, unknown>;
}

export function decodeGoogleIdToken(idToken: string): ProviderAccount {
  const parts = idToken.split('.');
  if (parts.length < 2) throw new GoogleOAuthError('bad_token', 'Malformed Google id_token');
  try {
    // The id_token was returned by Google's TLS token endpoint over a channel we initiated, so
    // verifying its signature here would be redundant for this BFF exchange.
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as unknown;
    const claims = asObject(payload);
    const sub = claims.sub;
    const email = claims.email;
    const name = claims.name;
    if (typeof sub !== 'string' || !sub || typeof email !== 'string' || typeof name !== 'string')
      throw new GoogleOAuthError('bad_token', 'Google id_token is missing required claims');
    return { id: sub, email, name };
  } catch (error: unknown) {
    if (error instanceof GoogleOAuthError) throw error;
    throw new GoogleOAuthError('bad_token', 'Malformed Google id_token');
  }
}

function parseCache(cache: string): GoogleCache {
  try {
    const value = JSON.parse(cache) as Partial<GoogleCache>;
    if (
      value.v !== 1 ||
      typeof value.refreshToken !== 'string' ||
      !value.refreshToken ||
      typeof value.sub !== 'string' ||
      !value.sub ||
      typeof value.email !== 'string' ||
      typeof value.name !== 'string'
    )
      throw new GoogleOAuthError('bad_token', 'Malformed Google token cache');
    return {
      v: 1,
      refreshToken: value.refreshToken,
      sub: value.sub,
      email: value.email,
      name: value.name,
    };
  } catch (error: unknown) {
    if (error instanceof GoogleOAuthError) throw error;
    throw new GoogleOAuthError('bad_token', 'Malformed Google token cache');
  }
}

function expiresOn(value: unknown): Date | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(Date.now() + value * 1000)
    : null;
}

function tokenError(response: TokenResponse, status: number): GoogleOAuthError {
  const code = typeof response.error === 'string' ? response.error : `http_${status}`;
  const message =
    typeof response.error_description === 'string'
      ? response.error_description
      : 'Google OAuth failed';
  return new GoogleOAuthError(code, message);
}

function defaultFetch(input: string, init?: Parameters<FetchLike>[1]): Promise<FetchResponse> {
  return (globalThis.fetch as FetchLike)(input, init);
}

export function createGoogleProvider(fetchImpl: FetchLike = defaultFetch): AuthProvider {
  return {
    id: 'google',
    scopes: GOOGLE_SCOPES,

    async authorizationUrl({ redirectUri, state, codeChallenge, selectAccount }) {
      const { clientId } = config();
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: GOOGLE_SCOPES.join(' '),
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        access_type: 'offline',
      });
      // Google only guarantees a refresh token when consent is forced; repeat sign-ins need one
      // because the BFF has no session cache to silently recover from.
      params.set('prompt', selectAccount ? 'consent select_account' : 'consent');
      return `${GOOGLE_AUTH_URL}?${params.toString()}`;
    },

    async redeem({ code, verifier, redirectUri }) {
      const { clientId, clientSecret } = config();
      const response = await fetchImpl(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      });
      const body = asObject(await response.json()) as TokenResponse;
      if (!response.ok) throw tokenError(body, response.status);
      if (typeof body.refresh_token !== 'string' || !body.refresh_token)
        throw new GoogleOAuthError('invalid_grant', 'Google did not issue a refresh token');
      if (typeof body.id_token !== 'string') throw new GoogleOAuthError('bad_token');
      const account = decodeGoogleIdToken(body.id_token);
      return {
        account,
        cache: JSON.stringify({
          v: 1,
          refreshToken: body.refresh_token,
          sub: account.id,
          email: account.email,
          name: account.name,
        } satisfies GoogleCache),
      };
    },

    async accessToken(cache) {
      const current = parseCache(cache);
      const { clientId, clientSecret } = config();
      const response = await fetchImpl(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: current.refreshToken,
        }),
      });
      const body = asObject(await response.json()) as TokenResponse;
      if (!response.ok) throw tokenError(body, response.status);
      if (typeof body.access_token !== 'string' || !body.access_token)
        throw new GoogleOAuthError('bad_token', 'Google did not return an access token');
      const account =
        typeof body.id_token === 'string'
          ? decodeGoogleIdToken(body.id_token)
          : { id: current.sub, email: current.email, name: current.name };
      const nextCache: GoogleCache = {
        v: 1,
        refreshToken:
          typeof body.refresh_token === 'string' && body.refresh_token
            ? body.refresh_token
            : current.refreshToken,
        sub: account.id,
        email: account.email,
        name: account.name,
      };
      const token: AccessToken = {
        accessToken: body.access_token,
        expiresOn: expiresOn(body.expires_in),
      };
      return { token, cache: JSON.stringify(nextCache) };
    },
  };
}

export const googleProvider = createGoogleProvider();
