import { BELT_SCHEME, type OrgPreset } from '@badgy/shared';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_SECTIONS,
  settingsPaneVisibility,
  summarizeSettingsSection,
} from './settings-sections.js';

const org: OrgPreset = {
  id: 'microsoft',
  label: 'Microsoft',
  summary: '3 days a week',
  scheme: BELT_SCHEME,
  target: 0.8,
  holidaySet: 'us-microsoft',
  confidence: 'official',
  sources: [],
};

const baseCtx = {
  pattern: {},
  org,
  scheme: BELT_SCHEME,
  target: 0.8,
  holidayRegion: 'us-microsoft',
  holidayCount: 11,
  meetupCount: 0,
  theme: 'system' as const,
  accountName: null as string | null,
};

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

describe('summarizeSettingsSection', () => {
  it('reports default weekdays when the pattern has no overrides', () => {
    expect(summarizeSettingsSection('usual-week', baseCtx)).toBe('Default weekdays');
  });

  it('counts pattern overrides', () => {
    expect(summarizeSettingsSection('usual-week', { ...baseCtx, pattern: { 1: 'remote' } })).toBe(
      '1 day set',
    );
    expect(
      summarizeSettingsSection('usual-week', { ...baseCtx, pattern: { 1: 'remote', 2: 'office' } }),
    ).toBe('2 days set');
  });

  it('names the workplace and scheme kind', () => {
    expect(summarizeSettingsSection('workplace-policy', baseCtx)).toBe(
      'Microsoft · Best weeks in a rolling window',
    );
  });

  it('formats the target as a percent', () => {
    expect(summarizeSettingsSection('target', baseCtx)).toBe('80% target');
  });

  it('names the holiday region and count', () => {
    expect(summarizeSettingsSection('holidays', baseCtx)).toBe(
      'United States — Microsoft · 11 this year',
    );
  });

  it('falls back to the raw region id when unknown', () => {
    expect(
      summarizeSettingsSection('holidays', { ...baseCtx, holidayRegion: 'not-a-real-region' }),
    ).toBe('not-a-real-region · 11 this year');
  });

  it('reports unmarked and marked meetup weeks', () => {
    expect(summarizeSettingsSection('meetup-weeks', baseCtx)).toBe('None marked');
    expect(summarizeSettingsSection('meetup-weeks', { ...baseCtx, meetupCount: 3 })).toBe(
      '3 marked',
    );
  });

  it('labels the active theme mode', () => {
    expect(summarizeSettingsSection('appearance', { ...baseCtx, theme: 'dark' })).toBe('Dark');
  });

  it('reports the signed-in account or that none is signed in', () => {
    expect(summarizeSettingsSection('account', baseCtx)).toBe('Not signed in');
    expect(summarizeSettingsSection('account', { ...baseCtx, accountName: 'Kyle P' })).toBe(
      'Kyle P',
    );
  });
});

describe('settingsPaneVisibility', () => {
  it('always shows both on wide viewports', () => {
    expect(settingsPaneVisibility(false, null)).toEqual({ showNav: true, showDetail: true });
    expect(settingsPaneVisibility(false, 'target')).toEqual({ showNav: true, showDetail: true });
  });

  it('shows only the section list on narrow viewports until a section is picked', () => {
    expect(settingsPaneVisibility(true, null)).toEqual({ showNav: true, showDetail: false });
  });

  it('shows only the full-width detail once a section is picked on narrow viewports', () => {
    expect(settingsPaneVisibility(true, 'target')).toEqual({ showNav: false, showDetail: true });
  });
});
