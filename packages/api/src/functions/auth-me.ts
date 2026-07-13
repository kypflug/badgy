import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { cca } from '../lib/auth';
import { isCorruptTokenCacheFailure, safeErrorDetail } from '../lib/errors';
import { isSecure } from '../lib/req';
import { readSessionResult, sessionCookie } from '../lib/session';
import { deleteCache, loadCache, logError, StoreError } from '../lib/store';

/** Who is signed in (from the session cookie), or 401. Replaces the client's initAuth(). */
async function me(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const result = readSessionResult(req);
  if (result.status === 'missing')
    return { status: 401, jsonBody: { signedIn: false, error: 'no_session' } };
  if (result.status === 'invalid')
    return { status: 401, jsonBody: { signedIn: false, error: 'invalid_session' } };

  const session = result.session;
  try {
    const cache = await loadCache(session.uid);
    if (!cache) return { status: 401, jsonBody: { signedIn: false, error: 'reauth' } };
    const client = cca();
    try {
      client.getTokenCache().deserialize(cache);
    } catch (error: unknown) {
      throw new StoreError('corrupt', { cause: error });
    }
    const account = await client.getTokenCache().getAccountByHomeId(session.uid);
    if (!account) {
      await deleteCache(session.uid);
      return { status: 401, jsonBody: { signedIn: false, error: 'reauth' } };
    }
    return {
      headers: { 'Cache-Control': 'no-store' },
      cookies: [sessionCookie(session, isSecure(req))],
      jsonBody: {
        signedIn: true,
        id: session.uid,
        name: session.name,
        email: session.email,
      },
    };
  } catch (error: unknown) {
    const detail = safeErrorDetail(error);
    context.error('auth me failed', detail);
    await logError('auth-me', JSON.stringify(detail));
    if (isCorruptTokenCacheFailure(error)) {
      try {
        await deleteCache(session.uid);
        return { status: 401, jsonBody: { signedIn: false, error: 'reauth' } };
      } catch (deleteError: unknown) {
        const deleteDetail = safeErrorDetail(deleteError);
        context.error('auth me corrupt cache delete failed', deleteDetail);
        await logError('auth-me-cache-delete', JSON.stringify(deleteDetail));
      }
    }
    return { status: 503, jsonBody: { signedIn: false, error: 'temporarily_unavailable' } };
  }
}

app.http('auth-me', { methods: ['GET'], authLevel: 'anonymous', route: 'auth/me', handler: me });
