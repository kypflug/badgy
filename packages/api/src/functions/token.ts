import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { classifyTokenFailure, isCorruptTokenCacheFailure, safeErrorDetail } from '../lib/errors';
import { getProvider } from '../lib/providers';
import { allowedOrigin } from '../lib/req';
import { readSessionResult, sessionProvider } from '../lib/session';
import { deleteCache, loadCache, logError, saveCache } from '../lib/store';

/**
 * Mint a fresh provider access token for the cookie session using the server-held refresh token.
 * The browser calls the provider directly with this short-lived token — attendance data never
 * transits this server. SameSite=Lax on the session cookie plus the origin check guard against CSRF.
 */
async function token(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const session = readSessionResult(req);
  if (session.status === 'missing') return { status: 401, jsonBody: { error: 'no_session' } };
  if (session.status === 'invalid') return { status: 401, jsonBody: { error: 'invalid_session' } };
  const origin = req.headers.get('origin');
  if (!allowedOrigin(origin)) return { status: 403, jsonBody: { error: 'bad_origin' } };

  const providerId = sessionProvider(session.session);
  try {
    const blob = await loadCache(providerId, session.session.uid);
    if (!blob) return { status: 401, jsonBody: { error: 'reauth' } };
    const result = await getProvider(providerId).accessToken(blob);
    await saveCache(providerId, session.session.uid, result.cache);
    return {
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: { accessToken: result.token.accessToken, expiresOn: result.token.expiresOn },
    };
  } catch (error: unknown) {
    const detail = safeErrorDetail(error);
    const kind = classifyTokenFailure(error);
    context.error('token failed', { ...detail, classification: kind });
    await logError('token', JSON.stringify({ ...detail, classification: kind }));
    // Only storage/decryption corruption is auto-deleted here. Provider-level bad_token failures
    // (for example malformed Google cache JSON) deliberately return reauth and are overwritten by
    // the next successful sign-in, avoiding deletion on provider/parser compatibility mistakes.
    if (isCorruptTokenCacheFailure(error)) {
      try {
        await deleteCache(providerId, session.session.uid);
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
