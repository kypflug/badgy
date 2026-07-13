import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpRequest, type InvocationContext } from '@azure/functions';
import { InteractionRequiredAuthError, ServerError } from '@azure/msal-node';
import { logout } from '../functions/auth-logout';
import { isValidEncryptionKey } from '../lib/crypto';
import { classifyTokenFailure, isCorruptTokenCacheFailure } from '../lib/errors';
import { FixedWindowRateLimiter, forwardedClientKey } from '../lib/rate-limit';
import { isBadgyRequest } from '../lib/req';
import { clearCookie, oauthCookie, sessionCookie } from '../lib/session';
import { isConcurrencyConflict, isEntityNotFound, StoreError } from '../lib/store';
import {
  AUTH_CLAIM_TTL_MS,
  AUTH_REDEMPTION_LEASE_MS,
  type AuthTransactionData,
  callbackClaimRecoveryDecision,
  callbackStateDecision,
  cleanupIsDue,
  completionDecision,
  hashSecret,
  isAuthTransactionData,
  transactionCleanupAt,
  verifySecret,
} from '../lib/transactions';

process.env.SESSION_KEY = Buffer.alloc(32, 7).toString('base64');

function transaction(overrides: Partial<AuthTransactionData> = {}): AuthTransactionData {
  return {
    version: 1,
    state: 'state',
    verifier: 'verifier',
    pollSecretHash: hashSecret('poll-secret'),
    expiresAt: Date.now() + 60_000,
    status: 'pending',
    ...overrides,
  };
}

test('poll secrets are hashed and verified without storing the secret', () => {
  const hash = hashSecret('poll-secret');
  assert.notEqual(hash, 'poll-secret');
  assert.equal(verifySecret('poll-secret', hash), true);
  assert.equal(verifySecret('wrong-secret', hash), false);
  assert.equal(verifySecret('poll-secret', 'malformed'), false);
});

test('completion decisions enforce expiry and transaction states', () => {
  const now = Date.now();
  assert.deepEqual(completionDecision(transaction(), 'poll-secret', now), { kind: 'pending' });
  assert.deepEqual(completionDecision(transaction({ expiresAt: now }), 'poll-secret', now), {
    kind: 'expired',
  });
  assert.deepEqual(completionDecision(transaction(), 'wrong-secret', now), { kind: 'invalid' });
  assert.deepEqual(
    completionDecision(
      transaction({ status: 'failed', failureCode: 'access_denied' }),
      'poll-secret',
      now,
    ),
    { kind: 'failed', code: 'access_denied' },
  );
});

test('completed transactions transition to consumed exactly once', () => {
  const claimExpiresAt = Date.now() + AUTH_CLAIM_TTL_MS;
  const completed = transaction({
    status: 'completed',
    claimExpiresAt,
    account: { id: 'id', name: 'name', email: 'email' },
  });
  const first = completionDecision(completed, 'poll-secret');
  assert.equal(first.kind, 'complete');
  if (first.kind !== 'complete') return;
  assert.equal(first.needsConsume, true);
  assert.equal(first.consumed.status, 'consumed');
  const retry = completionDecision(first.consumed, 'poll-secret');
  assert.equal(retry.kind, 'complete');
  if (retry.kind !== 'complete') return;
  assert.equal(retry.needsConsume, false);
  assert.deepEqual(retry.account, first.account);
});

test('completion uses pending expiry before callback and claim expiry after success', () => {
  const now = Date.now();
  const account = { id: 'id', name: 'name', email: 'email' };
  assert.deepEqual(
    completionDecision(
      transaction({
        status: 'redeeming',
        expiresAt: now - 1,
        claimId: 'claim',
        redeemExpiresAt: now + 1,
      }),
      'poll-secret',
      now,
    ),
    { kind: 'pending' },
  );
  assert.deepEqual(
    completionDecision(
      transaction({
        status: 'redeeming',
        expiresAt: now + 1,
        claimId: 'claim',
        redeemExpiresAt: now,
      }),
      'poll-secret',
      now,
    ),
    { kind: 'expired' },
  );
  assert.equal(
    completionDecision(
      transaction({
        status: 'completed',
        expiresAt: now - 1,
        claimExpiresAt: now + AUTH_CLAIM_TTL_MS,
        account,
      }),
      'poll-secret',
      now,
    ).kind,
    'complete',
  );
  assert.deepEqual(
    completionDecision(
      transaction({ status: 'consumed', claimExpiresAt: now, account }),
      'poll-secret',
      now,
    ),
    { kind: 'expired' },
  );
});

test('callback state decisions claim only pending transactions', () => {
  const now = Date.now();
  const claimId = 'claim-id';
  const pending = callbackStateDecision(transaction(), claimId, now);
  assert.equal(pending.kind, 'claim');
  if (pending.kind !== 'claim') return;
  assert.equal(pending.redeeming.claimId, claimId);
  assert.equal(pending.redeeming.redeemExpiresAt, now + AUTH_REDEMPTION_LEASE_MS);
  assert.deepEqual(callbackStateDecision(transaction({ expiresAt: now }), claimId, now), {
    kind: 'expired',
    mayFail: true,
  });
  assert.equal(
    callbackStateDecision(
      transaction({
        status: 'redeeming',
        claimId: 'other-claim',
        redeemExpiresAt: now + 1,
      }),
      claimId,
      now,
    ).kind,
    'duplicate',
  );
  const reclaimed = callbackStateDecision(
    transaction({
      status: 'redeeming',
      expiresAt: now + 1,
      claimId: 'expired-claim',
      redeemExpiresAt: now,
    }),
    claimId,
    now,
  );
  assert.equal(reclaimed.kind, 'claim');
  if (reclaimed.kind !== 'claim') return;
  assert.equal(reclaimed.redeeming.claimId, claimId);
  assert.equal(reclaimed.redeeming.redeemExpiresAt, now + AUTH_REDEMPTION_LEASE_MS);
  assert.deepEqual(callbackClaimRecoveryDecision(reclaimed.redeeming, claimId), 'owned');
  assert.equal(callbackClaimRecoveryDecision(reclaimed.redeeming, 'other-claim'), 'duplicate');
  assert.equal(callbackClaimRecoveryDecision(transaction(), claimId), 'unresolved');
  assert.deepEqual(
    callbackStateDecision(
      transaction({
        status: 'redeeming',
        expiresAt: now,
        claimId: 'expired-claim',
        redeemExpiresAt: now,
      }),
      claimId,
      now,
    ),
    { kind: 'expired', mayFail: false },
  );
  assert.equal(
    callbackStateDecision(
      transaction({
        status: 'completed',
        claimExpiresAt: now + AUTH_CLAIM_TTL_MS,
        account: { id: 'id', name: 'name', email: 'email' },
      }),
      claimId,
      now,
    ).kind,
    'duplicate',
  );
  assert.equal(
    callbackStateDecision(
      transaction({
        status: 'consumed',
        claimExpiresAt: now + AUTH_CLAIM_TTL_MS,
        account: { id: 'id', name: 'name', email: 'email' },
      }),
      claimId,
      now,
    ).kind,
    'duplicate',
  );
});

test('cleanup metadata follows pending and claim expiry', () => {
  const now = Date.now();
  const pending = transaction({ expiresAt: now + 10 });
  const completed = transaction({
    status: 'completed',
    expiresAt: now - 10,
    claimExpiresAt: now + 20,
    account: { id: 'id', name: 'name', email: 'email' },
  });
  const redeeming = transaction({
    status: 'redeeming',
    expiresAt: now - 10,
    claimId: 'c'.repeat(32),
    redeemExpiresAt: now + 15,
  });
  assert.equal(transactionCleanupAt(pending), pending.expiresAt);
  assert.equal(transactionCleanupAt(redeeming), redeeming.redeemExpiresAt);
  assert.equal(transactionCleanupAt(completed), completed.claimExpiresAt);
  assert.equal(cleanupIsDue(now, now), true);
  assert.equal(cleanupIsDue(now + 1, now), false);
  assert.equal(cleanupIsDue('invalid', now), false);
  const validCompleted = {
    ...completed,
    state: 's'.repeat(32),
    verifier: 'v'.repeat(32),
  };
  assert.equal(isAuthTransactionData(validCompleted), true);
  assert.equal(isAuthTransactionData({ ...validCompleted, claimExpiresAt: undefined }), false);
  const validRedeeming = {
    ...redeeming,
    state: 's'.repeat(32),
    verifier: 'v'.repeat(32),
  };
  assert.equal(isAuthTransactionData(validRedeeming), true);
  assert.equal(isAuthTransactionData({ ...validRedeeming, claimId: undefined }), false);
  assert.equal(isAuthTransactionData({ ...validRedeeming, redeemExpiresAt: undefined }), false);
});

test('logout retains the session cookie when cache deletion fails', async () => {
  const session = sessionCookie({ uid: 'id', name: 'name', email: 'email' }, true);
  const request = new HttpRequest({
    method: 'POST',
    url: 'https://badgy.tech/api/auth/logout',
    headers: { cookie: `${session.name}=${encodeURIComponent(session.value)}` },
  });
  const logged: unknown[] = [];
  const context = {
    error: (...args: unknown[]) => {
      logged.push(args);
    },
  } as unknown as InvocationContext;
  const failed = await logout(request, context, {
    deleteCache: async () => {
      throw new StoreError('unavailable');
    },
    logError: async () => {},
  });
  assert.equal(failed.status, 503);
  assert.equal(failed.cookies, undefined);
  assert.equal(logged.length, 1);

  const succeeded = await logout(request, context, {
    deleteCache: async () => {},
    logError: async () => {},
  });
  assert.equal(succeeded.status, 204);
  assert.equal(succeeded.cookies?.[0]?.maxAge, 0);
});

test('session and OAuth cookies include absolute and relative expiry', () => {
  const before = Date.now();
  const session = sessionCookie({ uid: 'id', name: 'name', email: 'email' }, true);
  const oauth = oauthCookie({ state: 'state', verifier: 'verifier' }, true);
  assert.equal(session.maxAge, 60 * 60 * 24 * 30);
  assert.ok(session.expires instanceof Date);
  assert.ok(session.expires.getTime() >= before + session.maxAge * 1000);
  assert.equal(oauth.maxAge, 600);
  assert.ok(oauth.expires instanceof Date);
  assert.ok(oauth.expires.getTime() >= before + oauth.maxAge * 1000);
  const cleared = clearCookie('cookie', true);
  assert.equal(cleared.maxAge, 0);
  assert.equal((cleared.expires as Date).getTime(), 0);
});

test('token failures distinguish reauthentication from service failures', () => {
  assert.equal(
    classifyTokenFailure(new InteractionRequiredAuthError('interaction_required')),
    'reauth',
  );
  assert.equal(
    classifyTokenFailure(new ServerError('invalid_grant', undefined, undefined, undefined, 400)),
    'reauth',
  );
  assert.equal(
    classifyTokenFailure(
      new ServerError('temporarily_unavailable', undefined, undefined, undefined, 503),
    ),
    'unavailable',
  );
  assert.equal(classifyTokenFailure(new Error('network failure')), 'unavailable');
  assert.equal(classifyTokenFailure(new StoreError('encryption')), 'unavailable');
  assert.equal(classifyTokenFailure(new StoreError('corrupt')), 'reauth');
  assert.equal(isCorruptTokenCacheFailure(new StoreError('corrupt')), true);
  assert.equal(isCorruptTokenCacheFailure(new StoreError('encryption')), false);
});

test('global encryption key configuration is not treated as cache corruption', () => {
  assert.equal(isValidEncryptionKey(undefined), false);
  assert.equal(isValidEncryptionKey('not-a-key'), false);
  assert.equal(isValidEncryptionKey(Buffer.alloc(32, 1).toString('base64')), true);
});

test('table errors distinguish missing entities and concurrency conflicts', () => {
  assert.equal(isEntityNotFound({ statusCode: 404 }), true);
  assert.equal(isEntityNotFound({ statusCode: 503 }), false);
  assert.equal(isConcurrencyConflict({ statusCode: 412 }), true);
  assert.equal(isConcurrencyConflict({ statusCode: 503 }), false);
});

test('durable auth posts require the Badgy header and exact same origin', () => {
  process.env.APP_BASE_URL = 'https://badgy.tech';
  const request = (origin: string, requestedWith = 'badgy') =>
    new HttpRequest({
      method: 'POST',
      url: 'https://badgy.tech/api/auth/start',
      headers: { origin, 'x-requested-with': requestedWith },
    });
  assert.equal(isBadgyRequest(request('https://badgy.tech')), true);
  assert.equal(isBadgyRequest(request('https://www.badgy.tech')), false);
  assert.equal(isBadgyRequest(request('https://badgy.tech', 'other')), false);
  delete process.env.APP_BASE_URL;
});

test('auth start rate limiter is per key, resets, and bounds stored keys', () => {
  const limiter = new FixedWindowRateLimiter({ limit: 2, windowMs: 1000, maxKeys: 2 });
  assert.equal(limiter.allow('a', 0), true);
  assert.equal(limiter.allow('a', 1), true);
  assert.equal(limiter.allow('a', 2), false);
  assert.equal(limiter.allow('b', 2), true);
  assert.equal(limiter.allow('c', 3), true);
  assert.equal(limiter.size, 2);
  assert.equal(limiter.allow('a', 1000), true);
});

test('forwarded client keys are stable hashes rather than raw addresses', () => {
  const request = (address: string) =>
    new HttpRequest({
      method: 'POST',
      url: 'https://badgy.tech/api/auth/start',
      headers: { 'x-forwarded-for': `${address}, 10.0.0.1` },
    });
  const first = forwardedClientKey(request('203.0.113.1'));
  assert.equal(first, forwardedClientKey(request('203.0.113.1')));
  assert.notEqual(first, forwardedClientKey(request('203.0.113.2')));
  assert.equal(first.includes('203.0.113.1'), false);
});
