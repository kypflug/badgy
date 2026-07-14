import { describe, expect, it } from 'vitest';
import { countStatuses, STATUS_LABEL, STATUS_SHORT, STATUSES } from './types.js';

describe('status display taxonomy', () => {
  it('keeps the canonical display order and labels', () => {
    expect(STATUSES).toEqual(['office', 'remote', 'travel', 'holiday', 'vacation', 'sick', 'oof']);
    expect(STATUS_LABEL.travel).toBe('Business Travel');
    expect(STATUS_LABEL.oof).toBe('Other');
    expect(STATUS_SHORT.travel).toBe('Travel');
    expect(STATUS_SHORT.oof).toBe('Other');
  });

  it('counts editable statuses and omits untracked days', () => {
    expect(
      countStatuses([
        { status: 'office' },
        { status: 'remote' },
        { status: 'travel' },
        { status: 'travel' },
        { status: 'none' },
      ]),
    ).toEqual({
      office: 1,
      remote: 1,
      travel: 2,
      vacation: 0,
      sick: 0,
      holiday: 0,
      oof: 0,
    });
  });
});
