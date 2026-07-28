import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_SECTIONS,
  settingsPaneVisibility,
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
