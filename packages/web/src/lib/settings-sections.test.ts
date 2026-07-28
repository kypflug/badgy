import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_SECTIONS,
  settingsSectionForScroll,
} from './settings-sections.js';

describe('SETTINGS_SECTIONS', () => {
  it('lists every section in the approved order', () => {
    expect(SETTINGS_SECTIONS.map((s) => s.id)).toEqual([
      'usual-week',
      'workplace-policy',
      'target',
      'holidays',
      'meetup-weeks',
      'appearance',
      'account',
    ]);
  });

  it('defaults to the first section', () => {
    expect(DEFAULT_SETTINGS_SECTION).toBe(SETTINGS_SECTIONS[0].id);
  });
});

describe('settingsSectionForScroll', () => {
  const positions = [
    { id: 'usual-week' as const, top: 100 },
    { id: 'workplace-policy' as const, top: 300 },
    { id: 'target' as const, top: 600 },
  ];

  it('keeps the first section active before another heading crosses the threshold', () => {
    expect(settingsSectionForScroll(positions, 250)).toBe('usual-week');
  });

  it('uses the last heading that crossed the threshold', () => {
    expect(settingsSectionForScroll(positions, 300)).toBe('workplace-policy');
    expect(settingsSectionForScroll(positions, 800)).toBe('target');
  });

  it('pins the final section at the bottom and defaults safely when empty', () => {
    expect(settingsSectionForScroll(positions, 0, true)).toBe('target');
    expect(settingsSectionForScroll([], 0)).toBe(DEFAULT_SETTINGS_SECTION);
  });
});
