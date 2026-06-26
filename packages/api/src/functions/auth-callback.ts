import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { cca, GRAPH_SCOPES } from '../lib/auth';
import { baseUrl, isSecure, redirectUri } from '../lib/req';
import { clearCookie, OAUTH_COOKIE, readOAuth, sessionCookie } from '../lib/session';
import { logError, saveCache } from '../lib/store';

/** OAuth redirect target: redeem the code, persist the encrypted token cache, set the session. */
async function callback(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const url = new URL(req.url);
  const secure = isSecure(req);
  const base = baseUrl(req);
  const home = (query: string): HttpResponseInit => ({
    status: 302,
    headers: { Location: `${base}/${query}` },
    cookies: [clearCookie(OAUTH_COOKIE, secure)],
  });

  try {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    if (error) return home(`?auth=error&e=${encodeURIComponent(error)}`);

    const oauth = readOAuth(req);
    if (!code || !state || !oauth || oauth.state !== state) return home('?auth=invalid');

    const client = cca();
    const result = await client.acquireTokenByCode({
      code,
      scopes: GRAPH_SCOPES,
      redirectUri: redirectUri(req),
      codeVerifier: oauth.verifier,
    });
    const acct = result.account;
    if (!acct) return home('?auth=noaccount');

    await saveCache(acct.homeAccountId, client.getTokenCache().serialize());
    const session = {
      uid: acct.homeAccountId,
      name: acct.name ?? acct.username,
      email: acct.username,
    };
    return {
      status: 302,
      headers: { Location: `${base}/` },
      cookies: [sessionCookie(session, secure), clearCookie(OAUTH_COOKIE, secure)],
    };
  } catch (e: unknown) {
    const err = e as {
      errorCode?: string;
      errorMessage?: string;
      message?: string;
      stack?: string;
    };
    context.error('callback failed', err);
    await logError(
      'callback',
      JSON.stringify({
        errorCode: err.errorCode,
        message: err.errorMessage ?? err.message,
        stack: err.stack?.slice(0, 1800),
      }),
    );
    const tag = (err.errorCode ?? err.errorMessage ?? err.message ?? 'exception').toString();
    return home(`?auth=fail&e=${encodeURIComponent(tag.slice(0, 120))}`);
  }
}

app.http('auth-callback', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/callback',
  handler: callback,
});
