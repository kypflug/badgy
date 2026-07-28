import { describe, expect, it } from 'vitest';
import { formatPct, initialsFor, rangeEditMessage } from './format.js';

describe('formatPct', () => {
  it('renders an em dash for null/undefined', () => {
    expect(formatPct(null)).toBe('—');
    expect(formatPct(undefined)).toBe('—');
  });

  it('rounds to the nearest whole percent', () => {
    expect(formatPct(0.804)).toBe('80%');
    expect(formatPct(0.806)).toBe('81%');
  });
});

describe('rangeEditMessage', () => {
  it('pluralizes the day count and includes the shortcut', () => {
    expect(rangeEditMessage(1, 'set', '⌘Z')).toBe('1 day set · ⌘Z to undo');
    expect(rangeEditMessage(12, 'set', '⌘Z')).toBe('12 days set · ⌘Z to undo');
    expect(rangeEditMessage(3, 'cleared', 'Ctrl+Z')).toBe('3 days cleared · Ctrl+Z to undo');
  });
});

describe('initialsFor', () => {
  it('takes the first letter of the first and last name', () => {
    expect(initialsFor('Kyle Pflug')).toBe('KP');
  });

  it('falls back to a single initial for a one-word name', () => {
    expect(initialsFor('Madonna')).toBe('M');
  });

  it('skips punctuation before a name segment', () => {
    expect(initialsFor('Dev (local)')).toBe('DL');
  });

  it('returns an empty string for blank input', () => {
    expect(initialsFor('   ')).toBe('');
  });
});
