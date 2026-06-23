import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TableClient } from '@azure/data-tables';
import type { AppData } from '@rto/shared';

/** Per-user private storage of the full app dataset. */
export interface UserStore {
  get(userId: string): Promise<AppData | null>;
  put(userId: string, data: AppData): Promise<void>;
  kind: string;
}

const TABLE_NAME = 'rtodata';
const ROW_KEY = 'app';

/** Table/blob keys forbid control chars and a few symbols; make a safe key. */
function safeKey(userId: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: deliberately stripping control chars
  return userId.replace(/[\u0000-\u001f\u007f-\u009f/\\#?]/g, '_');
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { statusCode?: number }).statusCode === 404
  );
}

class TableUserStore implements UserStore {
  readonly kind = 'azure-table';
  constructor(private readonly client: TableClient) {}

  async get(userId: string): Promise<AppData | null> {
    try {
      const entity = await this.client.getEntity<{ data: string }>(safeKey(userId), ROW_KEY);
      return JSON.parse(entity.data) as AppData;
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async put(userId: string, data: AppData): Promise<void> {
    await this.client.upsertEntity(
      { partitionKey: safeKey(userId), rowKey: ROW_KEY, data: JSON.stringify(data) },
      'Replace',
    );
  }
}

class FileUserStore implements UserStore {
  readonly kind = 'local-file';
  constructor(private readonly dir: string) {}

  private file(userId: string): string {
    return join(this.dir, `${safeKey(userId)}.json`);
  }

  async get(userId: string): Promise<AppData | null> {
    try {
      return JSON.parse(await readFile(this.file(userId), 'utf8')) as AppData;
    } catch {
      return null;
    }
  }

  async put(userId: string, data: AppData): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.file(userId), JSON.stringify(data));
  }
}

/**
 * Pick a backend from the environment:
 *  - AZURE_STORAGE_CONNECTION_STRING → Azure Table Storage (also works with Azurite)
 *  - AZURE_STORAGE_ACCOUNT           → Azure Table Storage via Managed Identity
 *  - otherwise                       → local JSON files (dev)
 */
export async function createStore(): Promise<UserStore> {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (conn) {
    const client = TableClient.fromConnectionString(conn, TABLE_NAME, {
      allowInsecureConnection: conn.includes('127.0.0.1') || conn.includes('localhost'),
    });
    await client.createTable().catch(() => undefined);
    return new TableUserStore(client);
  }

  const account = process.env.AZURE_STORAGE_ACCOUNT;
  if (account) {
    const { DefaultAzureCredential } = await import('@azure/identity');
    const client = new TableClient(
      `https://${account}.table.core.windows.net`,
      TABLE_NAME,
      new DefaultAzureCredential(),
    );
    await client.createTable().catch(() => undefined);
    return new TableUserStore(client);
  }

  const dir = process.env.LOCAL_DATA_DIR ?? join(process.cwd(), 'local-data');
  return new FileUserStore(dir);
}
