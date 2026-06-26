import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { isSecure } from '../lib/req';
import { clearCookie, readSession, SESSION_COOKIE } from '../lib/session';
import { deleteCache } from '../lib/store';

/** Clear the session cookie and drop the server-side token cache. */
async function logout(req: HttpRequest): Promise<HttpResponseInit> {
  const s = readSession(req);
  if (s) await deleteCache(s.uid);
  return { status: 204, cookies: [clearCookie(SESSION_COOKIE, isSecure(req))] };
}

app.http('auth-logout', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/logout',
  handler: logout,
});
