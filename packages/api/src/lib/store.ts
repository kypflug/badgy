import { createHash } from 'node:crypto';
import { TableClient } from '@azure/data-tables';
import { decrypt, encrypt } from './crypto';

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
  if (!k) throw new Error('TOKEN_ENC_KEY not configured');
  return k;
}

function rowKey(uid: string): string {
  return createHash('sha256').update(uid).digest('hex');
}

interface CacheEntity {
  partitionKey: string;
  rowKey: string;
  blob: string;
}

export async function loadCache(uid: string): Promise<string | null> {
  try {
    const e = await table().getEntity<CacheEntity>('u', rowKey(uid));
    return decrypt(e.blob, tokenKey());
  } catch {
    return null;
  }
}

export async function saveCache(uid: string, serialized: string): Promise<void> {
  const entity: CacheEntity = {
    partitionKey: 'u',
    rowKey: rowKey(uid),
    blob: encrypt(serialized, tokenKey()),
  };
  await table().upsertEntity(entity, 'Replace');
}

export async function deleteCache(uid: string): Promise<void> {
  try {
    await table().deleteEntity('u', rowKey(uid));
  } catch {
    // already gone — fine
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
