/**
 * Which employer's return-to-office policy is this visitor here for?
 *
 * Resolution order, most explicit first: hostname label → first path segment → `?org=` →
 * the choice we remembered last time → the neutral default. Path routing is what ships, because
 * Azure Static Web Apps allows only a handful of custom domains and no wildcard; hostname
 * resolution is checked first anyway so pointing `amazon.badgy.tech` at the app later needs a DNS
 * record and nothing else.
 */
import { DEFAULT_ORG_ID, findOrg, type OrgPreset, orgOrDefault } from '@badgy/shared';

const STORAGE_KEY = 'badgy.org';

/** First path segments that are app routes rather than employer ids. */
const RESERVED_SEGMENTS = new Set(['api', 'orgs', 'index.html', 'sw.js', 'manifest.webmanifest']);

/** Host labels that never name an employer. */
const RESERVED_HOSTS = new Set(['www', 'badgy', 'localhost', 'app']);

export type OrgSource = 'host' | 'path' | 'query' | 'stored' | 'default';

export interface OrgEntry {
  org: OrgPreset;
  source: OrgSource;
}

export interface LocationParts {
  hostname: string;
  pathname: string;
  search: string;
}

function fromHost(hostname: string): string | null {
  const labels = hostname.split('.');
  // Needs a real sub-domain: `badgy.tech` must not resolve the org "badgy".
  if (labels.length < 3) return null;
  const label = labels[0].toLowerCase();
  return RESERVED_HOSTS.has(label) ? null : label;
}

function fromPath(pathname: string): string | null {
  const segment = pathname.split('/').filter(Boolean)[0];
  if (!segment) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment).toLowerCase();
  } catch {
    return null;
  }
  return RESERVED_SEGMENTS.has(decoded) || decoded.includes('.') ? null : decoded;
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function rememberOrg(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // private mode / quota — the URL still works, we just won't remember it
  }
}

export function forgetOrg(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Pure resolution, so the ordering rules are testable without a document. */
export function resolveOrgFrom(parts: LocationParts, stored: string | null = null): OrgEntry {
  const candidates: { id: string | null; source: OrgSource }[] = [
    { id: fromHost(parts.hostname), source: 'host' },
    { id: fromPath(parts.pathname), source: 'path' },
    { id: new URLSearchParams(parts.search).get('org'), source: 'query' },
    { id: stored, source: 'stored' },
  ];
  for (const candidate of candidates) {
    if (!candidate.id) continue;
    const org = findOrg(candidate.id);
    if (org) return { org, source: candidate.source };
  }
  return { org: orgOrDefault(DEFAULT_ORG_ID), source: 'default' };
}

/**
 * Resolve the org for this page load, remember an explicit choice, and strip it back out of the
 * URL so the auth round-trip and the cached service-worker shell both stay on `/`.
 */
export function resolveOrg(): OrgEntry {
  try {
    const entry = resolveOrgFrom(window.location, readStored());
    if (entry.source !== 'stored' && entry.source !== 'default') rememberOrg(entry.org.id);
    const url = new URL(window.location.href);
    const hadPath = url.pathname !== '/';
    const hadQuery = url.searchParams.has('org');
    if (hadPath || hadQuery) {
      url.pathname = '/';
      url.searchParams.delete('org');
      history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
    return entry;
  } catch {
    return { org: orgOrDefault(DEFAULT_ORG_ID), source: 'default' };
  }
}
