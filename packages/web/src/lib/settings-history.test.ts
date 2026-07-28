import { describe, expect, it, vi } from 'vitest';
import { isSettingsHistoryState, pushSettingsHistoryState } from './settings-history.js';

describe('isSettingsHistoryState', () => {
  it('recognizes the Settings marker', () => {
    expect(isSettingsHistoryState({ badgySettings: true })).toBe(true);
  });

  it('rejects other shapes', () => {
    expect(isSettingsHistoryState(null)).toBe(false);
    expect(isSettingsHistoryState(undefined)).toBe(false);
    expect(isSettingsHistoryState('badgySettings')).toBe(false);
    expect(isSettingsHistoryState({})).toBe(false);
    expect(isSettingsHistoryState({ badgySettings: false })).toBe(false);
    expect(isSettingsHistoryState({ other: true })).toBe(false);
  });
});

describe('pushSettingsHistoryState', () => {
  it('pushes a same-URL entry carrying the marker', () => {
    const pushState = vi.fn();
    pushSettingsHistoryState({ pushState });
    expect(pushState).toHaveBeenCalledTimes(1);
    const [state, , url] = pushState.mock.calls[0];
    expect(isSettingsHistoryState(state)).toBe(true);
    expect(url).toBeUndefined();
  });
});
