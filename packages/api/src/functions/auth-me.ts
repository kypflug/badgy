import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { readSession } from '../lib/session';

/** Who is signed in (from the session cookie), or 401. Replaces the client's initAuth(). */
async function me(req: HttpRequest): Promise<HttpResponseInit> {
  const s = readSession(req);
  if (!s) return { status: 401, jsonBody: { signedIn: false } };
  return { jsonBody: { signedIn: true, id: s.uid, name: s.name, email: s.email } };
}

app.http('auth-me', { methods: ['GET'], authLevel: 'anonymous', route: 'auth/me', handler: me });
