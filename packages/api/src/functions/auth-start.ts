import { createHash, randomBytes } from 'node:crypto';
import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { safeErrorDetail } from '../lib/errors';
import { getProvider, isProviderId, type ProviderId } from '../lib/providers';
import { FixedWindowRateLimiter, forwardedClientKey } from '../lib/rate-limit';
import { isBadgyRequest, redirectUri } from '../lib/req';
import { cleanupExpiredAuthEntities, createAuthTransaction, logError } from '../lib/store';
import { AUTH_TRANSACTION_TTL_MS, type AuthTransactionData, hashSecret } from '../lib/transactions';

const startRateLimiter = new FixedWindowRateLimiter({
  limit: 10,
  windowMs: 60_000,
  maxKeys: 4096,
});

async function requestBody(
  req: HttpRequest,
): Promise<{ selectAccount: boolean; provider: ProviderId }> {
  const text = await req.text();
  if (!text.trim()) return { selectAccount: false, provider: 'microsoft' };
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid body');
  const selectAccount = (value as { selectAccount?: unknown }).selectAccount;
  if (selectAccount !== undefined && typeof selectAccount !== 'boolean')
    throw new Error('invalid selectAccount');
  const provider = (value as { provider?: unknown }).provider;
  if (provider !== undefined && !isProviderId(provider)) throw new Error('invalid provider');
  return { selectAccount: selectAccount === true, provider: provider ?? 'microsoft' };
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

  let body: { selectAccount: boolean; provider: ProviderId };
  try {
    body = await requestBody(req);
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
    const provider = getProvider(body.provider);
    const authorizationUrl = await provider.authorizationUrl({
      redirectUri: redirectUri(req),
      state,
      codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
      selectAccount: body.selectAccount,
    });
    const transaction: AuthTransactionData = {
      version: 1,
      provider: provider.id,
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
