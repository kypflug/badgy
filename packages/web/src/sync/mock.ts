import type { Doc } from '@rto/shared';
import type { SyncTransport } from './types.js';

/**
 * Dev-only transport: a localStorage-backed "remote" so the full app (and the sync
 * engine's pull/merge/push path) works locally before the MSAL app is registered.
 */
const KEY = 'badgy:mock-remote';
let etag = 0;

export const mockTransport: SyncTransport = {
  async getRemote() {
    const raw = localStorage.getItem(KEY);
    return raw ? { doc: JSON.parse(raw) as Doc, etag: String(etag) } : null;
  },
  async putRemote(doc) {
    localStorage.setItem(KEY, JSON.stringify(doc));
    etag += 1;
    return { etag: String(etag) };
  },
};
