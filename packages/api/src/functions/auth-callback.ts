import { randomBytes } from 'node:crypto';
import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { cca, GRAPH_SCOPES } from '../lib/auth';
import { safeErrorDetail } from '../lib/errors';
import { baseUrl, isSecure, redirectUri } from '../lib/req';
import { clearCookie, OAUTH_COOKIE, readOAuth, sessionCookie } from '../lib/session';
import {
  loadAuthTransactionByState,
  logError,
  type StoredAuthTransaction,
  saveCache,
  updateAuthTransaction,
} from '../lib/store';
import {
  AUTH_CLAIM_TTL_MS,
  type AuthFailureCode,
  callbackClaimRecoveryDecision,
  callbackFailureCode,
  callbackStateDecision,
} from '../lib/transactions';

function htmlPage(success: boolean): HttpResponseInit {
  const title = success ? 'Sign-in complete' : 'Sign-in failed';
  const message = success
    ? 'You can return to Badgy. This window may close automatically.'
    : 'Return to Badgy and try signing in again.';
  const close = success ? '<script>window.close()</script>' : '';
  return {
    status: success ? 200 : 400,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
    body: `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><main><h1>${title}</h1><p>${message}</p></main>${close}</body></html>`,
  };
}

async function failOwnedTransaction(
  stored: StoredAuthTransaction,
  failureCode: AuthFailureCode,
): Promise<boolean> {
  return !!(await updateAuthTransaction(stored, {
    ...stored.data,
    status: 'failed',
    failureCode,
  }));
}

async function responseAfterConflict(state: string): Promise<HttpResponseInit> {
  const current = await loadAuthTransactionByState(state);
  return htmlPage(
    current?.data.status === 'redeeming' ||
      current?.data.status === 'completed' ||
      current?.data.status === 'consumed',
  );
}

async function claimTransaction(
  stored: StoredAuthTransaction,
  claimId: string,
  redeeming: StoredAuthTransaction['data'],
): Promise<StoredAuthTransaction | null> {
  try {
    const updated = await updateAuthTransaction(stored, redeeming);
    if (!updated) return null;
    return callbackClaimRecoveryDecision(updated.data, claimId) === 'owned' ? updated : null;
  } catch (error: unknown) {
    const current = await loadAuthTransactionByState(stored.data.state);
    if (current) {
      const recovery = callbackClaimRecoveryDecision(current.data, claimId);
      if (recovery === 'owned') return current;
      if (recovery === 'duplicate') return null;
    }
    throw error;
  }
}

async function transactionCallback(
  req: HttpRequest,
  stored: StoredAuthTransaction,
  code: string | null,
  oauthError: string | null,
): Promise<HttpResponseInit> {
  const claimId = randomBytes(32).toString('base64url');
  const stateDecision = callbackStateDecision(stored.data, claimId);
  if (stateDecision.kind === 'duplicate') return htmlPage(true);
  if (stateDecision.kind === 'failed') return htmlPage(false);
  if (stateDecision.kind === 'expired') {
    if (stateDecision.mayFail) await failOwnedTransaction(stored, 'transaction_expired');
    return htmlPage(false);
  }

  const claimed = await claimTransaction(stored, claimId, stateDecision.redeeming);
  if (!claimed) return responseAfterConflict(stored.data.state);

  if (oauthError) {
    const failed = await failOwnedTransaction(claimed, callbackFailureCode(oauthError));
    if (!failed) return responseAfterConflict(stored.data.state);
    return htmlPage(false);
  }
  if (!code) {
    const failed = await failOwnedTransaction(claimed, 'invalid_callback');
    if (!failed) return responseAfterConflict(stored.data.state);
    return htmlPage(false);
  }

  try {
    const client = cca();
    const result = await client.acquireTokenByCode({
      code,
      scopes: GRAPH_SCOPES,
      redirectUri: redirectUri(req),
      codeVerifier: claimed.data.verifier,
    });
    const account = result.account;
    if (!account) {
      const failed = await failOwnedTransaction(claimed, 'auth_failed');
      if (!failed) return responseAfterConflict(claimed.data.state);
      return htmlPage(false);
    }
    await saveCache(account.homeAccountId, client.getTokenCache().serialize());
    const completed = await updateAuthTransaction(claimed, {
      ...claimed.data,
      status: 'completed',
      claimExpiresAt: Date.now() + AUTH_CLAIM_TTL_MS,
      account: {
        id: account.homeAccountId,
        name: account.name ?? account.username,
        email: account.username,
      },
    });
    if (completed) return htmlPage(true);
    return responseAfterConflict(claimed.data.state);
  } catch (error: unknown) {
    try {
      await failOwnedTransaction(claimed, 'auth_failed');
    } catch {
      // Preserve the redemption error; recording the owned failure is best effort.
    }
    throw error;
  }
}

async function legacyCallback(
  req: HttpRequest,
  code: string | null,
  state: string | null,
  oauthError: string | null,
): Promise<HttpResponseInit> {
  const secure = isSecure(req);
  const base = baseUrl(req);
  const home = (query: string): HttpResponseInit => ({
    status: 302,
    headers: { Location: `${base}/${query}` },
    cookies: [clearCookie(OAUTH_COOKIE, secure)],
  });

  if (oauthError) return home(`?auth=error&e=${callbackFailureCode(oauthError)}`);
  const oauth = readOAuth(req);
  if (!code || !state || !oauth || oauth.state !== state) return home('?auth=invalid');

  const client = cca();
  const result = await client.acquireTokenByCode({
    code,
    scopes: GRAPH_SCOPES,
    redirectUri: redirectUri(req),
    codeVerifier: oauth.verifier,
  });
  const account = result.account;
  if (!account) return home('?auth=noaccount');

  await saveCache(account.homeAccountId, client.getTokenCache().serialize());
  const session = {
    uid: account.homeAccountId,
    name: account.name ?? account.username,
    email: account.username,
  };
  return {
    status: 302,
    headers: { Location: `${base}/` },
    cookies: [sessionCookie(session, secure), clearCookie(OAUTH_COOKIE, secure)],
  };
}

/** OAuth redirect target for durable transactions, with a legacy cookie-flow fallback. */
async function callback(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');
  let flow: 'unknown' | 'durable' | 'legacy' = 'unknown';

  try {
    if (state) {
      const transaction = await loadAuthTransactionByState(state);
      if (transaction) {
        flow = 'durable';
        return await transactionCallback(req, transaction, code, oauthError);
      }
    }
    flow = 'legacy';
    return await legacyCallback(req, code, state, oauthError);
  } catch (e: unknown) {
    const detail = safeErrorDetail(e);
    context.error('callback failed', detail);
    await logError('callback', JSON.stringify(detail));
    return flow === 'legacy' ? legacyCallback(req, null, null, 'auth_failed') : htmlPage(false);
  }
}

app.http('auth-callback', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/callback',
  handler: callback,
});
