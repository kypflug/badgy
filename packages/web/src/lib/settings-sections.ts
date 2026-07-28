/**
 * Settings-as-a-destination: the section taxonomy and the pure desktop/mobile visibility rule.
 * Pure and store-free so it's testable without mounting any component — `settings-page.ts`
 * supplies the live data.
 */
export type SettingsSectionId =
  | 'usual-week'
  | 'workplace-policy'
  | 'target'
  | 'holidays'
  | 'meetup-weeks'
  | 'appearance'
  | 'account';

export interface SettingsSectionMeta {
  id: SettingsSectionId;
  label: string;
}

/** Section order as presented in the nav. */
export const SETTINGS_SECTIONS: readonly SettingsSectionMeta[] = [
  { id: 'usual-week', label: 'Your usual week' },
  { id: 'workplace-policy', label: 'Workplace policy' },
  { id: 'target', label: 'Target' },
  { id: 'holidays', label: 'Holidays' },
  { id: 'meetup-weeks', label: 'Meetup weeks' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'account', label: 'Account' },
];

export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = SETTINGS_SECTIONS[0].id;

export interface SettingsPaneVisibility {
  showNav: boolean;
  showDetail: boolean;
}

/**
 * Desktop always shows the section nav and the selected section's detail side by side — "rail nav
 * selects detail pane". Narrow viewports show one full-width step at a time: the section list, or
 * — once a section is picked — its detail with its own back control (the confirmed mobile
 * drill-down). `isNarrow` should track the same breakpoint the Workbench frame itself collapses at
 * (see the `.workbench` media query in `app.css`) so Settings never disagrees with the shell.
 */
export function settingsPaneVisibility(
  isNarrow: boolean,
  activeSection: SettingsSectionId | null,
): SettingsPaneVisibility {
  if (!isNarrow) return { showNav: true, showDetail: true };
  return { showNav: activeSection === null, showDetail: activeSection !== null };
}
