import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { cca, GRAPH_SCOPES } from '../lib/auth';
import { classifyTokenFailure, isCorruptTokenCacheFailure, safeErrorDetail } from '../lib/errors';
import { allowedOrigin } from '../lib/req';
import { readSessionResult } from '../lib/session';
import { deleteCache, loadCache, logError, StoreError, saveCache } from '../lib/store';

/**
 * Mint a fresh Graph access token for the cookie session using the server-held refresh token.
 * The browser calls Graph directly with this short-lived token — attendance data never transits
 * this server. SameSite=Lax on the session cookie plus the origin check guard against CSRF.
 */
async function token(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const session = readSessionResult(req);
  if (session.status === 'missing') return { status: 401, jsonBody: { error: 'no_session' } };
  if (session.status === 'invalid') return { status: 401, jsonBody: { error: 'invalid_session' } };
  const origin = req.headers.get('origin');
  if (!allowedOrigin(origin)) return { status: 403, jsonBody: { error: 'bad_origin' } };

  try {
    const blob = await loadCache(session.session.uid);
    if (!blob) return { status: 401, jsonBody: { error: 'reauth' } };
    const client = cca();
    try {
      client.getTokenCache().deserialize(blob);
    } catch (error: unknown) {
      throw new StoreError('corrupt', { cause: error });
    }
    const account = await client.getTokenCache().getAccountByHomeId(session.session.uid);
    if (!account) {
      await deleteCache(session.session.uid);
      return { status: 401, jsonBody: { error: 'reauth' } };
    }
    const result = await client.acquireTokenSilent({ account, scopes: GRAPH_SCOPES });
    await saveCache(session.session.uid, client.getTokenCache().serialize());
    return {
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: { accessToken: result.accessToken, expiresOn: result.expiresOn },
    };
  } catch (error: unknown) {
    const detail = safeErrorDetail(error);
    const kind = classifyTokenFailure(error);
    context.error('token failed', { ...detail, classification: kind });
    await logError('token', JSON.stringify({ ...detail, classification: kind }));
    if (isCorruptTokenCacheFailure(error)) {
      try {
        await deleteCache(session.session.uid);
      } catch (deleteError: unknown) {
        const deleteDetail = safeErrorDetail(deleteError);
        context.error('token corrupt cache delete failed', deleteDetail);
        await logError('token-cache-delete', JSON.stringify(deleteDetail));
        return { status: 503, jsonBody: { error: 'temporarily_unavailable' } };
      }
    }
    return kind === 'reauth'
      ? { status: 401, jsonBody: { error: 'reauth' } }
      : { status: 503, jsonBody: { error: 'temporarily_unavailable' } };
  }
}

app.http('token', { methods: ['POST'], authLevel: 'anonymous', route: 'token', handler: token });
