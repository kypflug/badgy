import { describe, expect, it } from 'vitest';
import { resolveOrgFrom } from './resolve.js';

const at = (pathname: string, hostname = 'badgy.tech', search = '') => ({
  hostname,
  pathname,
  search,
});

describe('org resolution', () => {
  it('prefers a sub-domain over everything else', () => {
    const entry = resolveOrgFrom(at('/google', 'amazon.badgy.tech', '?org=apple'), 'ibm');
    expect(entry.org.id).toBe('amazon');
    expect(entry.source).toBe('host');
  });

  it('does not read an org out of the apex domain', () => {
    expect(resolveOrgFrom(at('/', 'badgy.tech')).source).toBe('default');
    expect(resolveOrgFrom(at('/', 'www.badgy.tech')).source).toBe('default');
  });

  it('resolves the first path segment', () => {
    const entry = resolveOrgFrom(at('/amazon'));
    expect(entry.org.id).toBe('amazon');
    expect(entry.source).toBe('path');
  });

  it('ignores reserved and file-like segments', () => {
    expect(resolveOrgFrom(at('/api/auth/start')).source).toBe('default');
    expect(resolveOrgFrom(at('/manifest.webmanifest')).source).toBe('default');
    expect(resolveOrgFrom(at('/orgs')).source).toBe('default');
  });

  it('falls back to the query string, then the remembered choice', () => {
    expect(resolveOrgFrom(at('/', 'badgy.tech', '?org=meta')).org.id).toBe('meta');
    const remembered = resolveOrgFrom(at('/'), 'nvidia');
    expect(remembered.org.id).toBe('nvidia');
    expect(remembered.source).toBe('stored');
  });

  it('is case insensitive and survives an unknown id', () => {
    expect(resolveOrgFrom(at('/AMAZON')).org.id).toBe('amazon');
    const unknown = resolveOrgFrom(at('/not-a-real-employer'));
    expect(unknown.source).toBe('default');
    expect(unknown.org.id).toBe('generic');
  });

  it('never lets an unknown URL discard a remembered choice', () => {
    expect(resolveOrgFrom(at('/not-a-real-employer'), 'apple').org.id).toBe('apple');
  });
});
