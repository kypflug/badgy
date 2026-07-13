import { createHash } from 'node:crypto';
import { odata, TableClient, type TransactionAction } from '@azure/data-tables';
import { decrypt, encrypt, isValidEncryptionKey } from './crypto';
import {
  type AuthTransactionData,
  cleanupIsDue,
  isAuthTransactionData,
  transactionCleanupAt,
} from './transactions';

/**
 * Per-user MSAL token cache, encrypted at rest in Azure Table Storage. The refresh token never
 * leaves the server; the browser only ever holds the session cookie (and a short-lived AT it
 * fetches via /api/token). RowKey is a hash of the MSAL home account id.
 */
const TABLE = 'tokencache';
let client: TableClient | undefined;

function table(): TableClient {
  if (!client) {
    const conn = process.env.STORAGE_CONNECTION;
    if (!conn) throw new Error('STORAGE_CONNECTION not configured');
    client = TableClient.fromConnectionString(conn, TABLE);
  }
  return client;
}

function tokenKey(): string {
  const k = process.env.TOKEN_ENC_KEY;
  if (!isValidEncryptionKey(k)) throw new StoreError('encryption');
  return k;
}

function rowKey(uid: string): string {
  return createHash('sha256').update(uid).digest('hex');
}

interface CacheEntity {
  [key: string]: unknown;
  partitionKey: string;
  rowKey: string;
  blob: string;
}

interface TransactionEntity extends CacheEntity {}

interface StateEntity {
  [key: string]: unknown;
  partitionKey: string;
  rowKey: string;
  transactionKey: string;
  expiresAt: number;
  cleanupAt: number;
}

interface CleanupEntity {
  [key: string]: unknown;
  partitionKey: string;
  rowKey: string;
  cleanupAt?: number;
}

export interface StoredAuthTransaction {
  rowKey: string;
  etag: string;
  data: AuthTransactionData;
}

export type StoreErrorKind = 'unavailable' | 'encryption' | 'corrupt';

export class StoreError extends Error {
  constructor(
    public readonly kind: StoreErrorKind,
    options?: { cause?: unknown },
  ) {
    super(`store ${kind}`, options);
    this.name = 'StoreError';
  }
}

function statusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const value = (error as { statusCode?: unknown }).statusCode;
  return typeof value === 'number' ? value : undefined;
}

export function isEntityNotFound(error: unknown): boolean {
  return statusCode(error) === 404;
}

export function isConcurrencyConflict(error: unknown): boolean {
  return statusCode(error) === 409 || statusCode(error) === 412;
}

function encrypted(value: string): string {
  const key = tokenKey();
  try {
    return encrypt(value, key);
  } catch (error: unknown) {
    throw new StoreError('encryption', { cause: error });
  }
}

function decrypted(value: string): string {
  const key = tokenKey();
  try {
    return decrypt(value, key);
  } catch (error: unknown) {
    throw new StoreError('corrupt', { cause: error });
  }
}

function transactionRowKey(transactionId: string): string {
  return `t-${rowKey(transactionId)}`;
}

function stateRowKey(state: string): string {
  return `s-${rowKey(state)}`;
}

export async function loadCache(uid: string): Promise<string | null> {
  let entity: CacheEntity;
  try {
    entity = await table().getEntity<CacheEntity>('u', rowKey(uid));
  } catch (error: unknown) {
    if (isEntityNotFound(error)) return null;
    throw new StoreError('unavailable', { cause: error });
  }
  if (typeof entity.blob !== 'string') throw new StoreError('corrupt');
  return decrypted(entity.blob);
}

export async function saveCache(uid: string, serialized: string): Promise<void> {
  const entity: CacheEntity = {
    partitionKey: 'u',
    rowKey: rowKey(uid),
    blob: encrypted(serialized),
  };
  try {
    await table().upsertEntity(entity, 'Replace');
  } catch (error: unknown) {
    throw new StoreError('unavailable', { cause: error });
  }
}

export async function deleteCache(uid: string): Promise<void> {
  try {
    await table().deleteEntity('u', rowKey(uid));
  } catch (error: unknown) {
    if (!isEntityNotFound(error)) throw new StoreError('unavailable', { cause: error });
  }
}

function parseTransaction(entity: TransactionEntity & { etag: string }): StoredAuthTransaction {
  if (typeof entity.blob !== 'string') throw new StoreError('corrupt');
  let data: unknown;
  try {
    data = JSON.parse(decrypted(entity.blob));
  } catch (error: unknown) {
    if (error instanceof StoreError) throw error;
    throw new StoreError('corrupt', { cause: error });
  }
  if (!isAuthTransactionData(data)) throw new StoreError('corrupt');
  return { rowKey: entity.rowKey, etag: entity.etag, data };
}

async function getTransaction(row: string): Promise<StoredAuthTransaction | null> {
  let entity: TransactionEntity & { etag: string };
  try {
    entity = await table().getEntity<TransactionEntity>('auth', row);
  } catch (error: unknown) {
    if (isEntityNotFound(error)) return null;
    throw new StoreError('unavailable', { cause: error });
  }
  return parseTransaction(entity);
}

export async function createAuthTransaction(
  transactionId: string,
  data: AuthTransactionData,
): Promise<void> {
  const transactionKey = transactionRowKey(transactionId);
  const transaction: TransactionEntity = {
    partitionKey: 'auth',
    rowKey: transactionKey,
    blob: encrypted(JSON.stringify(data)),
    cleanupAt: transactionCleanupAt(data),
  };
  const state: StateEntity = {
    partitionKey: 'auth',
    rowKey: stateRowKey(data.state),
    transactionKey,
    expiresAt: data.expiresAt,
    cleanupAt: data.expiresAt,
  };
  const actions: TransactionAction[] = [
    ['create', transaction],
    ['create', state],
  ];
  try {
    await table().submitTransaction(actions);
  } catch (error: unknown) {
    throw new StoreError('unavailable', { cause: error });
  }
}

export async function loadAuthTransactionById(
  transactionId: string,
): Promise<StoredAuthTransaction | null> {
  return getTransaction(transactionRowKey(transactionId));
}

export async function loadAuthTransactionByState(
  state: string,
): Promise<StoredAuthTransaction | null> {
  let index: StateEntity;
  try {
    index = await table().getEntity<StateEntity>('auth', stateRowKey(state));
  } catch (error: unknown) {
    if (isEntityNotFound(error)) return null;
    throw new StoreError('unavailable', { cause: error });
  }
  const transaction = await getTransaction(index.transactionKey);
  if (!transaction) throw new StoreError('corrupt');
  if (transaction.data.state !== state) throw new StoreError('corrupt');
  return transaction;
}

export async function updateAuthTransaction(
  stored: StoredAuthTransaction,
  data: AuthTransactionData,
): Promise<StoredAuthTransaction | null> {
  const entity: TransactionEntity = {
    partitionKey: 'auth',
    rowKey: stored.rowKey,
    blob: encrypted(JSON.stringify(data)),
    cleanupAt: transactionCleanupAt(data),
  };
  try {
    const response = await table().updateEntity(entity, 'Replace', { etag: stored.etag });
    if (!response.etag) return await getTransaction(stored.rowKey);
    return { rowKey: stored.rowKey, etag: response.etag, data };
  } catch (error: unknown) {
    if (isConcurrencyConflict(error)) return null;
    throw new StoreError('unavailable', { cause: error });
  }
}

export const AUTH_CLEANUP_BATCH_SIZE = 20;

export async function cleanupExpiredAuthEntities(
  now = Date.now(),
  limit = AUTH_CLEANUP_BATCH_SIZE,
): Promise<number> {
  if (!Number.isInteger(limit) || limit <= 0) return 0;
  const entities = table().listEntities<CleanupEntity>({
    queryOptions: {
      filter: odata`PartitionKey eq ${'auth'} and cleanupAt le ${now}`,
    },
  });
  let deleted = 0;
  try {
    const page = await entities.byPage({ maxPageSize: limit })[Symbol.asyncIterator]().next();
    if (page.done) return 0;
    for (const entity of page.value) {
      if (!cleanupIsDue(entity.cleanupAt, now)) continue;
      try {
        await table().deleteEntity(entity.partitionKey, entity.rowKey);
        deleted += 1;
      } catch (error: unknown) {
        if (!isEntityNotFound(error)) throw error;
      }
    }
    return deleted;
  } catch (error: unknown) {
    throw new StoreError('unavailable', { cause: error });
  }
}

/** Best-effort diagnostics sink (read back with partitionKey 'diag') for hard-to-reach errors. */
export async function logError(where: string, detail: string): Promise<void> {
  try {
    await table().upsertEntity(
      {
        partitionKey: 'diag',
        rowKey: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        where,
        detail: detail.slice(0, 30000),
      },
      'Replace',
    );
  } catch {
    // best effort
  }
}
