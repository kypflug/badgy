import { createHash, randomBytes } from 'node:crypto';
import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import type { AuthorizationUrlRequest } from '@azure/msal-node';
import { cca, GRAPH_SCOPES } from '../lib/auth';
import { safeErrorDetail } from '../lib/errors';
import { FixedWindowRateLimiter, forwardedClientKey } from '../lib/rate-limit';
import { isBadgyRequest, redirectUri } from '../lib/req';
import { cleanupExpiredAuthEntities, createAuthTransaction, logError } from '../lib/store';
import { AUTH_TRANSACTION_TTL_MS, type AuthTransactionData, hashSecret } from '../lib/transactions';

const startRateLimiter = new FixedWindowRateLimiter({
  limit: 10,
  windowMs: 60_000,
  maxKeys: 4096,
});

async function requestBody(req: HttpRequest): Promise<{ selectAccount: boolean }> {
  const text = await req.text();
  if (!text.trim()) return { selectAccount: false };
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid body');
  const selectAccount = (value as { selectAccount?: unknown }).selectAccount;
  if (selectAccount !== undefined && typeof selectAccount !== 'boolean')
    throw new Error('invalid selectAccount');
  return { selectAccount: selectAccount === true };
}

async function start(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (!isBadgyRequest(req)) return { status: 403, jsonBody: { error: 'forbidden' } };
  if (!startRateLimiter.allow(forwardedClientKey(req))) {
    return {
      status: 429,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' },
      jsonBody: { error: 'rate_limited' },
    };
  }

  let selectAccount: boolean;
  try {
    ({ selectAccount } = await requestBody(req));
  } catch {
    return { status: 400, jsonBody: { error: 'invalid_request' } };
  }

  try {
    try {
      await cleanupExpiredAuthEntities();
    } catch (error: unknown) {
      context.warn('auth transaction cleanup failed', safeErrorDetail(error));
    }
    const transactionId = randomBytes(32).toString('base64url');
    const pollSecret = randomBytes(32).toString('base64url');
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + AUTH_TRANSACTION_TTL_MS;
    const authRequest: AuthorizationUrlRequest = {
      scopes: GRAPH_SCOPES,
      redirectUri: redirectUri(req),
      state,
      codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
      codeChallengeMethod: 'S256',
    };
    if (selectAccount) authRequest.prompt = 'select_account';
    const authorizationUrl = await cca().getAuthCodeUrl(authRequest);
    const transaction: AuthTransactionData = {
      version: 1,
      state,
      verifier,
      pollSecretHash: hashSecret(pollSecret),
      expiresAt,
      status: 'pending',
    };
    await createAuthTransaction(transactionId, transaction);
    return {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: {
        transactionId,
        pollSecret,
        authorizationUrl,
        expiresAt: new Date(expiresAt).toISOString(),
      },
    };
  } catch (error: unknown) {
    const detail = safeErrorDetail(error);
    context.error('auth start failed', detail);
    await logError('auth-start', JSON.stringify(detail));
    return { status: 503, jsonBody: { error: 'temporarily_unavailable' } };
  }
}

app.http('auth-start', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/start',
  handler: start,
});
