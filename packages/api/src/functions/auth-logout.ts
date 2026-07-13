import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { safeErrorDetail } from '../lib/errors';
import { isSecure } from '../lib/req';
import { clearCookie, readSession, SESSION_COOKIE } from '../lib/session';
import { deleteCache, logError } from '../lib/store';

export interface LogoutDependencies {
  deleteCache: typeof deleteCache;
  logError: typeof logError;
}

const logoutDependencies: LogoutDependencies = { deleteCache, logError };

/** Clear the session cookie and drop the server-side token cache. */
export async function logout(
  req: HttpRequest,
  context: InvocationContext,
  dependencies: LogoutDependencies = logoutDependencies,
): Promise<HttpResponseInit> {
  const s = readSession(req);
  if (s) {
    try {
      await dependencies.deleteCache(s.uid);
    } catch (error: unknown) {
      const detail = safeErrorDetail(error);
      context.error('logout cache delete failed', detail);
      await dependencies.logError('auth-logout', JSON.stringify(detail));
      return {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
        jsonBody: { error: 'temporarily_unavailable' },
      };
    }
  }
  return { status: 204, cookies: [clearCookie(SESSION_COOKIE, isSecure(req))] };
}

app.http('auth-logout', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/logout',
  handler: logout,
});
