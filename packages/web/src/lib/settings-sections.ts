/**
 * Settings-as-a-destination: the section taxonomy, per-section current-value summaries shown in
 * the rail nav, and the pure desktop/mobile visibility rule. Pure and store-free so it's testable
 * without mounting any component — `settings-page.ts` supplies the live data.
 */
import {
  type ComplianceScheme,
  HOLIDAY_REGIONS,
  type HolidayRegionId,
  type OrgPreset,
  SCHEME_LABEL,
  type Status,
  type Weekday,
} from '@badgy/shared';
import { formatPct } from './format.js';
import type { ThemeMode } from './theme.js';

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

const THEME_MODE_LABEL: Record<ThemeMode, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

/** Everything a section's rail summary needs — plain data so it's testable without a Store. */
export interface SettingsSummaryContext {
  pattern: Partial<Record<Weekday, Status>>;
  org: OrgPreset;
  scheme: ComplianceScheme;
  target: number;
  holidayRegion: HolidayRegionId;
  holidayCount: number;
  meetupCount: number;
  theme: ThemeMode;
  accountName: string | null;
}

function usualWeekSummary(pattern: Partial<Record<Weekday, Status>>): string {
  const overrides = Object.keys(pattern).length;
  return overrides === 0 ? 'Default weekdays' : `${overrides} day${overrides === 1 ? '' : 's'} set`;
}

function workplacePolicySummary(org: OrgPreset, scheme: ComplianceScheme): string {
  return `${org.label} · ${SCHEME_LABEL[scheme.kind]}`;
}

function targetSummary(target: number): string {
  return `${formatPct(target)} target`;
}

function holidaysSummary(region: HolidayRegionId, count: number): string {
  const label = HOLIDAY_REGIONS.find((r) => r.id === region)?.label ?? region;
  return `${label} · ${count} this year`;
}

function meetupWeeksSummary(count: number): string {
  return count === 0 ? 'None marked' : `${count} marked`;
}

function appearanceSummary(theme: ThemeMode): string {
  return THEME_MODE_LABEL[theme];
}

function accountSummary(name: string | null): string {
  return name ?? 'Not signed in';
}

/** The one-line current-value summary shown beside a section in the nav. */
export function summarizeSettingsSection(
  id: SettingsSectionId,
  ctx: SettingsSummaryContext,
): string {
  switch (id) {
    case 'usual-week':
      return usualWeekSummary(ctx.pattern);
    case 'workplace-policy':
      return workplacePolicySummary(ctx.org, ctx.scheme);
    case 'target':
      return targetSummary(ctx.target);
    case 'holidays':
      return holidaysSummary(ctx.holidayRegion, ctx.holidayCount);
    case 'meetup-weeks':
      return meetupWeeksSummary(ctx.meetupCount);
    case 'appearance':
      return appearanceSummary(ctx.theme);
    case 'account':
      return accountSummary(ctx.accountName);
  }
}

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
