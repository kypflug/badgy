import { type Doc, emptyDoc, merge, migrate } from '@badgy/shared';
import { getAccessToken } from '../auth/provider.js';
import type { SyncTransport } from './types.js';

/**
 * Google Drive transport — the counterpart to `graph.ts`.
 *
 * `appDataFolder` is a hidden per-application space in the user's own Drive: the `drive.appdata`
 * scope reaches nothing else, and the file is invisible to other apps. Attendance data goes
 * straight from the browser to Drive, exactly as it does with OneDrive.
 *
 * Concurrency caveat: Drive v3 removed `etag` from the files resource and ignores `If-Match`, so
 * there is no server-enforced conditional write. We use the monotonically increasing `version`
 * field as the concurrency token and re-read it immediately before writing, reporting `'conflict'`
 * when it moved. First writes can also race because Drive creates by name rather than by path; list
 * queries are ordered by creation time so every client chooses the same oldest file, and a client
 * that created a loser merges its local doc into that deterministic winner.
 */
const FILE_NAME = 'badgy.json';
const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

interface DriveFile {
  id: string;
  version?: string;
}

interface FileList {
  files?: DriveFile[];
}

function isDoc(value: unknown): value is Doc {
  return typeof value === 'object' && value !== null && 'cells' in value;
}

async function authorized(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

/** The app-folder file's id and current version, or null before it has ever been written. */
async function findFile(): Promise<DriveFile | null> {
  const query = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name = '${FILE_NAME}' and trashed = false`,
    fields: 'files(id,version)',
    orderBy: 'createdTime',
    pageSize: '1',
  });
  const res = await authorized(`${FILES}?${query}`);
  if (!res.ok) throw new Error(`drive list ${res.status}`);
  const list = (await res.json()) as FileList;
  return list.files?.[0] ?? null;
}

async function readDoc(fileId: string): Promise<Doc | null> {
  const res = await authorized(`${FILES}/${fileId}?alt=media`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`drive content ${res.status}`);
  const parsed = (await res.json()) as unknown;
  return isDoc(parsed) ? parsed : emptyDoc();
}

async function writeDoc(fileId: string, doc: Doc): Promise<string | 'conflict'> {
  const res = await authorized(`${UPLOAD}/${fileId}?uploadType=media&fields=id,version`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(doc),
  });
  if (res.status === 412 || res.status === 409) return 'conflict';
  if (!res.ok) throw new Error(`drive put ${res.status}`);
  return ((await res.json()) as DriveFile).version ?? '';
}

async function createFile(doc: Doc): Promise<DriveFile> {
  const boundary = `badgy-${globalThis.crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] });
  const body =
    `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\ncontent-type: application/json\r\n\r\n${JSON.stringify(doc)}\r\n` +
    `--${boundary}--`;
  const res = await authorized(`${UPLOAD}?uploadType=multipart&fields=id,version`, {
    method: 'POST',
    headers: { 'content-type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`drive create ${res.status}`);
  return (await res.json()) as DriveFile;
}

async function createConvergedFile(doc: Doc): Promise<string | 'conflict'> {
  const created = await createFile(doc);
  const winner = await findFile();
  if (!winner || winner.id === created.id) return created.version ?? winner?.version ?? '';
  const merged = merge(migrate((await readDoc(winner.id)) ?? emptyDoc()), migrate(doc));
  return writeDoc(winner.id, merged);
}

export const googleDriveTransport: SyncTransport = {
  async getRemote() {
    const file = await findFile();
    if (!file) return null;
    const doc = await readDoc(file.id);
    if (!doc) return null;
    return { doc, etag: file.version ?? '' };
  },

  async putRemote(doc, etag) {
    const file = await findFile();
    if (!file) {
      const created = await createConvergedFile(doc);
      return created === 'conflict' ? 'conflict' : { etag: created };
    }
    // Stands in for the `if-match` OneDrive gets for free; see the note at the top of the file.
    if (etag !== null && file.version !== undefined && file.version !== etag) return 'conflict';
    const written = await writeDoc(file.id, doc);
    return written === 'conflict' ? 'conflict' : { etag: written };
  },
};
