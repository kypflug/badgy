import { afterEach, describe, expect, it, vi } from 'vitest';
import { Store } from './store.js';

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
