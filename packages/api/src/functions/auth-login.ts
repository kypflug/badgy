import { createHash, randomBytes } from 'node:crypto';
import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { cca, GRAPH_SCOPES } from '../lib/auth';
import { isSecure, redirectUri } from '../lib/req';
import { oauthCookie } from '../lib/session';

/** Start the OAuth code flow (PKCE + CSRF state) and redirect to Microsoft. */
async function login(req: HttpRequest): Promise<HttpResponseInit> {
  const state = randomBytes(16).toString('hex');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const url = await cca().getAuthCodeUrl({
    scopes: GRAPH_SCOPES,
    redirectUri: redirectUri(req),
    state,
    codeChallenge: challenge,
    codeChallengeMethod: 'S256',
  });
  return {
    status: 302,
    headers: { Location: url },
    cookies: [oauthCookie({ state, verifier }, isSecure(req))],
  };
}

app.http('auth-login', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/login',
  handler: login,
});
