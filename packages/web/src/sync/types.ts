import type { Doc } from '@badgy/shared';

/**
 * Remote document transport — a private per-app folder in the user's own cloud storage
 * (OneDrive via Graph, or Google Drive's `appDataFolder`).
 *
 * `etag` is an opaque per-transport concurrency token: a real HTTP ETag on Graph, and Drive's
 * `version` field on Google, which has no conditional-write support of its own.
 */
export interface SyncTransport {
  /** Fetch the remote doc + its concurrency token, or null if it doesn't exist yet. */
  getRemote(): Promise<{ doc: Doc; etag: string } | null>;
  /** Write the doc; pass the last known token for optimistic concurrency. `'conflict'` on mismatch. */
  putRemote(doc: Doc, etag: string | null): Promise<{ etag: string } | 'conflict'>;
}
