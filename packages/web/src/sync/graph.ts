import { type Doc, emptyDoc } from '@rto/shared';
import { getGraphToken } from '../auth/msal.js';
import type { SyncTransport } from './types.js';

// The app folder ("approot") is private to this app — the token can only touch this folder.
const ITEM = 'https://graph.microsoft.com/v1.0/me/drive/special/approot:/badgy.json';
const CONTENT = `${ITEM}:/content`;

interface DriveItem {
  eTag?: string;
  cTag?: string;
  '@microsoft.graph.downloadUrl'?: string;
}

function isDoc(value: unknown): value is Doc {
  return typeof value === 'object' && value !== null && 'cells' in value;
}

export const graphTransport: SyncTransport = {
  async getRemote() {
    const token = await getGraphToken();
    const metaRes = await fetch(ITEM, { headers: { authorization: `Bearer ${token}` } });
    if (metaRes.status === 404) return null;
    if (!metaRes.ok) throw new Error(`graph metadata ${metaRes.status}`);
    const item = (await metaRes.json()) as DriveItem;
    const etag = item.eTag ?? item.cTag ?? '';

    const url = item['@microsoft.graph.downloadUrl'];
    const contentRes = url
      ? await fetch(url) // pre-authenticated short-lived URL
      : await fetch(CONTENT, { headers: { authorization: `Bearer ${token}` } });
    if (contentRes.status === 404) return null;
    if (!contentRes.ok) throw new Error(`graph content ${contentRes.status}`);
    const parsed = (await contentRes.json()) as unknown;
    return { doc: isDoc(parsed) ? parsed : emptyDoc(), etag };
  },

  async putRemote(doc, etag) {
    const token = await getGraphToken();
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    };
    if (etag) headers['if-match'] = etag;
    const res = await fetch(CONTENT, { method: 'PUT', headers, body: JSON.stringify(doc) });
    if (res.status === 412 || res.status === 409) return 'conflict';
    if (!res.ok) throw new Error(`graph put ${res.status}`);
    const item = (await res.json()) as DriveItem;
    return { etag: item.eTag ?? item.cTag ?? '' };
  },
};
