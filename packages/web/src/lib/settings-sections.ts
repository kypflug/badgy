/** Settings-as-a-destination: section taxonomy and scroll-spy helpers. */
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

export interface SettingsSectionPosition {
  id: SettingsSectionId;
  top: number;
}

/**
 * Return the last heading that has crossed the pane's active threshold. At the bottom of the pane,
 * pin the final section so a short Account section can still become active.
 */
export function settingsSectionForScroll(
  positions: readonly SettingsSectionPosition[],
  threshold: number,
  atEnd = false,
): SettingsSectionId {
  if (positions.length === 0) return DEFAULT_SETTINGS_SECTION;
  if (atEnd) return positions[positions.length - 1].id;
  let active = positions[0].id;
  for (const position of positions) {
    if (position.top > threshold) break;
    active = position.id;
  }
  return active;
}
