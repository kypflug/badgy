import { createHash, timingSafeEqual } from 'node:crypto';

export const AUTH_TRANSACTION_TTL_MS = 10 * 60 * 1000;
export const AUTH_REDEMPTION_LEASE_MS = 2 * 60 * 1000;
export const AUTH_CLAIM_TTL_MS = 30 * 60 * 1000;

export type AuthTransactionStatus = 'pending' | 'redeeming' | 'completed' | 'failed' | 'consumed';

export interface AuthTransactionAccount {
  id: string;
  name: string;
  email: string;
}

export interface AuthTransactionData {
  version: 1;
  state: string;
  verifier: string;
  pollSecretHash: string;
  expiresAt: number;
  claimId?: string;
  redeemExpiresAt?: number;
  claimExpiresAt?: number;
  status: AuthTransactionStatus;
  account?: AuthTransactionAccount;
  failureCode?: AuthFailureCode;
}

export type AuthFailureCode =
  | 'access_denied'
  | 'auth_failed'
  | 'invalid_callback'
  | 'transaction_expired';

export type CompletionDecision =
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'pending' }
  | { kind: 'failed'; code: AuthFailureCode }
  | {
      kind: 'complete';
      account: AuthTransactionAccount;
      consumed: AuthTransactionData;
      needsConsume: boolean;
    };

export type CallbackStateDecision =
  | { kind: 'claim'; redeeming: AuthTransactionData }
  | { kind: 'duplicate' }
  | { kind: 'expired'; mayFail: boolean }
  | { kind: 'failed' };

export type CallbackClaimRecoveryDecision = 'owned' | 'duplicate' | 'unresolved';

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('base64url');
}

export function verifySecret(secret: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashSecret(secret), 'base64url');
  const expected = Buffer.from(expectedHash, 'base64url');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function completionDecision(
  transaction: AuthTransactionData,
  pollSecret: string,
  now = Date.now(),
): CompletionDecision {
  if (!verifySecret(pollSecret, transaction.pollSecretHash)) return { kind: 'invalid' };
  if (transaction.status === 'pending')
    return transaction.expiresAt <= now ? { kind: 'expired' } : { kind: 'pending' };
  if (transaction.status === 'redeeming')
    return !transaction.redeemExpiresAt || transaction.redeemExpiresAt <= now
      ? { kind: 'expired' }
      : { kind: 'pending' };
  if (transaction.status === 'failed')
    return transaction.expiresAt <= now
      ? { kind: 'expired' }
      : { kind: 'failed', code: transaction.failureCode ?? 'auth_failed' };
  if (!transaction.claimExpiresAt || transaction.claimExpiresAt <= now) return { kind: 'expired' };
  if (!transaction.account) return { kind: 'failed', code: 'auth_failed' };
  return {
    kind: 'complete',
    account: transaction.account,
    consumed: { ...transaction, status: 'consumed' },
    needsConsume: transaction.status === 'completed',
  };
}

export function callbackStateDecision(
  transaction: AuthTransactionData,
  claimId: string,
  now = Date.now(),
): CallbackStateDecision {
  if (transaction.status === 'completed' || transaction.status === 'consumed')
    return { kind: 'duplicate' };
  if (transaction.status === 'failed') return { kind: 'failed' };
  if (transaction.status === 'pending' && transaction.expiresAt <= now)
    return { kind: 'expired', mayFail: true };
  if (transaction.status === 'redeeming') {
    if ((transaction.redeemExpiresAt ?? 0) > now) return { kind: 'duplicate' };
    if (transaction.expiresAt <= now) return { kind: 'expired', mayFail: false };
  }
  return {
    kind: 'claim',
    redeeming: {
      ...transaction,
      status: 'redeeming',
      claimId,
      redeemExpiresAt: now + AUTH_REDEMPTION_LEASE_MS,
    },
  };
}

export function callbackClaimRecoveryDecision(
  transaction: AuthTransactionData,
  claimId: string,
): CallbackClaimRecoveryDecision {
  if (transaction.status === 'redeeming')
    return transaction.claimId === claimId ? 'owned' : 'duplicate';
  if (transaction.status === 'completed' || transaction.status === 'consumed') return 'duplicate';
  return 'unresolved';
}

export function transactionCleanupAt(transaction: AuthTransactionData): number {
  if (transaction.status === 'completed' || transaction.status === 'consumed')
    return transaction.claimExpiresAt ?? transaction.expiresAt;
  if (transaction.status === 'redeeming')
    return transaction.redeemExpiresAt ?? transaction.expiresAt;
  return transaction.expiresAt;
}

export function cleanupIsDue(cleanupAt: unknown, now = Date.now()): boolean {
  return typeof cleanupAt === 'number' && Number.isFinite(cleanupAt) && cleanupAt <= now;
}

export function callbackFailureCode(error: string | null): AuthFailureCode {
  return error === 'access_denied' ? 'access_denied' : 'auth_failed';
}

export function isAuthTransactionData(value: unknown): value is AuthTransactionData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<AuthTransactionData>;
  const validBase =
    data.version === 1 &&
    typeof data.state === 'string' &&
    data.state.length >= 32 &&
    typeof data.verifier === 'string' &&
    data.verifier.length >= 32 &&
    typeof data.pollSecretHash === 'string' &&
    data.pollSecretHash.length === 43 &&
    typeof data.expiresAt === 'number' &&
    Number.isFinite(data.expiresAt) &&
    ['pending', 'redeeming', 'completed', 'failed', 'consumed'].includes(data.status ?? '');
  if (!validBase) return false;
  if (data.status === 'redeeming') {
    return (
      typeof data.claimId === 'string' &&
      data.claimId.length >= 32 &&
      typeof data.redeemExpiresAt === 'number' &&
      Number.isFinite(data.redeemExpiresAt)
    );
  }
  if (data.status === 'completed' || data.status === 'consumed') {
    return (
      typeof data.claimExpiresAt === 'number' &&
      Number.isFinite(data.claimExpiresAt) &&
      !!data.account &&
      typeof data.account.id === 'string' &&
      data.account.id.length > 0 &&
      typeof data.account.name === 'string' &&
      typeof data.account.email === 'string'
    );
  }
  if (data.status === 'failed') {
    return (
      data.failureCode === 'access_denied' ||
      data.failureCode === 'auth_failed' ||
      data.failureCode === 'invalid_callback' ||
      data.failureCode === 'transaction_expired'
    );
  }
  return true;
}
