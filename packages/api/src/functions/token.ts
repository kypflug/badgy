import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { cca, GRAPH_SCOPES } from '../lib/auth';
import { allowedOrigin } from '../lib/req';
import { readSession } from '../lib/session';
import { loadCache, saveCache } from '../lib/store';

/**
 * Mint a fresh Graph access token for the cookie session using the server-held refresh token.
 * The browser calls Graph directly with this short-lived token — attendance data never transits
 * this server. SameSite=Lax on the session cookie plus the origin check guard against CSRF.
 */
async function token(req: HttpRequest): Promise<HttpResponseInit> {
  const s = readSession(req);
  if (!s) return { status: 401, jsonBody: { error: 'no_session' } };
  const origin = req.headers.get('origin');
  if (!allowedOrigin(origin)) return { status: 403, jsonBody: { error: 'bad_origin' } };

  const blob = await loadCache(s.uid);
  if (!blob) return { status: 401, jsonBody: { error: 'reauth' } };
  const client = cca();
  client.getTokenCache().deserialize(blob);
  const account = await client.getTokenCache().getAccountByHomeId(s.uid);
  if (!account) return { status: 401, jsonBody: { error: 'reauth' } };

  try {
    const result = await client.acquireTokenSilent({ account, scopes: GRAPH_SCOPES });
    await saveCache(s.uid, client.getTokenCache().serialize());
    return { jsonBody: { accessToken: result.accessToken, expiresOn: result.expiresOn } };
  } catch {
    return { status: 401, jsonBody: { error: 'reauth' } };
  }
}

app.http('token', { methods: ['POST'], authLevel: 'anonymous', route: 'token', handler: token });
