import type { Doc } from '@rto/shared';

/** Remote document transport (OneDrive app folder via Graph), with eTag concurrency. */
export interface SyncTransport {
  /** Fetch the remote doc + its eTag, or null if it doesn't exist yet. */
  getRemote(): Promise<{ doc: Doc; etag: string } | null>;
  /** Write the doc; pass the last known eTag for optimistic concurrency. `'conflict'` on eTag mismatch. */
  putRemote(doc: Doc, etag: string | null): Promise<{ etag: string } | 'conflict'>;
}
