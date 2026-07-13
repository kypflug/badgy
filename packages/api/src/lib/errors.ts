import { InteractionRequiredAuthError, ServerError } from '@azure/msal-node';
import { StoreError } from './store';

export type TokenFailureKind = 'reauth' | 'unavailable';

interface ErrorShape {
  name?: unknown;
  errorCode?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
}

function safeCode(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.-]{1,80}$/.test(value)) return undefined;
  return value;
}

function numericStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

export function safeErrorDetail(error: unknown): Record<string, string | number> {
  if (!error || typeof error !== 'object') return { kind: 'unknown' };
  const candidate = error as ErrorShape;
  const detail: Record<string, string | number> = {
    kind: error instanceof StoreError ? `store_${error.kind}` : 'exception',
  };
  const name = safeCode(candidate.name);
  const code = safeCode(candidate.errorCode) ?? safeCode(candidate.code);
  const status = numericStatus(candidate.status) ?? numericStatus(candidate.statusCode);
  if (name) detail.name = name;
  if (code) detail.code = code;
  if (status !== undefined) detail.status = status;
  return detail;
}

export function classifyTokenFailure(error: unknown): TokenFailureKind {
  if (error instanceof InteractionRequiredAuthError) return 'reauth';
  if (error instanceof StoreError) return error.kind === 'corrupt' ? 'reauth' : 'unavailable';

  const candidate = (error ?? {}) as ErrorShape;
  const code = safeCode(candidate.errorCode) ?? safeCode(candidate.code);
  if (
    code &&
    [
      'invalid_grant',
      'no_tokens_found',
      'bad_token',
      'refresh_token_expired',
      'token_refresh_required',
      'user_null',
    ].includes(code)
  )
    return 'reauth';

  if (error instanceof ServerError) {
    const status = numericStatus(candidate.status);
    if (status === 400 && code === 'invalid_grant') return 'reauth';
  }
  return 'unavailable';
}

export function isCorruptTokenCacheFailure(error: unknown): boolean {
  return error instanceof StoreError && error.kind === 'corrupt';
}
