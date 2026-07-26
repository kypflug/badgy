import { type emptyDoc, findOrg, orgOrDefault } from '@badgy/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncTransport } from '../sync/types.js';
import { Store } from './store.js';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

/** A transport whose remote starts empty and records whatever is pushed. */
function fakeTransport(initial: ReturnType<typeof emptyDoc> | null = null) {
  const state = { doc: initial, etag: '1', failGet: false };
  const transport: SyncTransport = {
    async getRemote() {
      if (state.failGet) throw new Error('offline');
      return state.doc ? { doc: state.doc, etag: state.etag } : null;
    },
    async putRemote(doc) {
      state.doc = doc;
      return { etag: state.etag };
    },
  };
  return { transport, state };
}

async function startStore(transport: SyncTransport, orgId: string): Promise<Store> {
  const store = new Store();
  await store.start(transport, 'badgy:doc:test', orgOrDefault(orgId));
  // start() kicks the first sync off without awaiting it.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return store;
}

describe('Store workplace seeding', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    vi.stubGlobal('document', { addEventListener: vi.fn(), visibilityState: 'visible' });
    vi.stubGlobal('setInterval', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('seeds the entry preset into a brand-new document', async () => {
    const { transport } = fakeTransport();
    const store = await startStore(transport, 'amazon');
    const amazon = findOrg('amazon');

    expect(store.org.id).toBe('amazon');
    expect(store.scheme).toEqual(amazon?.scheme);
    expect(store.target).toBe(amazon?.target);
  });

  it('never overwrites a workplace the account already chose', async () => {
    const { transport, state } = fakeTransport();
    const first = await startStore(transport, 'salesforce');
    expect(first.org.id).toBe('salesforce');

    // A second device opens /amazon against the same, already-seeded remote.
    const returning = await startStore(transport, 'amazon');
    expect(returning.org.id).toBe('salesforce');
    expect(state.doc).not.toBeNull();
  });

  it('does not seed when the first pull fails', async () => {
    const { transport, state } = fakeTransport();
    state.failGet = true;
    const store = await startStore(transport, 'amazon');
    // The preset still drives the in-memory view, but nothing was written to the document.
    expect(store.org.id).toBe('amazon');
    expect(state.doc).toBeNull();
  });

  it('switches workplace on demand and can be reset', async () => {
    const { transport } = fakeTransport();
    const store = await startStore(transport, 'generic');
    store.setOrg('nvidia');
    expect(store.org.id).toBe('nvidia');
    expect(store.scheme.kind).toBe('none');
    expect(store.schemeIsCustom).toBe(false);

    store.setScheme({ ...store.scheme, kind: 'weekly-quota', daysPerWeek: 4, averagingWeeks: 1 });
    expect(store.schemeIsCustom).toBe(true);
    store.resetScheme();
    expect(store.schemeIsCustom).toBe(false);
  });
});

describe('Store calendar notes', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('normalizes, edits, deletes, and restores notes through history', () => {
    vi.useFakeTimers();
    const store = new Store();
    const created = store.createNote('2026-07-20', '2026-07-10', '  Planning  ', '#ABCDEF');

    expect(created).toMatchObject({
      start: '2026-07-10',
      end: '2026-07-20',
      label: 'Planning',
      color: '#abcdef',
    });
    expect(store.notesInRange('2026-07-15', '2026-07-15')).toEqual([created]);
    expect(store.notesInRange('2026-08-01', '2026-08-31')).toEqual([]);

    store.updateNote({ ...created, label: 'Updated' });
    expect(store.notesInRange('2026-07-01', '2026-07-31')[0].label).toBe('Updated');
    expect(store.undo()).toBe(true);
    expect(store.notesInRange('2026-07-01', '2026-07-31')[0].label).toBe('Planning');
    expect(store.redo()).toBe(true);
    expect(store.notesInRange('2026-07-01', '2026-07-31')[0].label).toBe('Updated');

    store.deleteNote(created.id);
    expect(store.notesInRange('2026-07-01', '2026-07-31')).toEqual([]);
    expect(store.undo()).toBe(true);
    expect(store.notesInRange('2026-07-01', '2026-07-31')[0].label).toBe('Updated');
  });

  it('rejects blank labels and invalid colors', () => {
    vi.useFakeTimers();
    const store = new Store();
    expect(() => store.createNote('2026-07-10', '2026-07-10', '   ', '#123456')).toThrow('label');
    expect(() => store.createNote('2026-07-10', '2026-07-10', 'Valid', 'red')).toThrow(
      'range or color',
    );
  });
});
