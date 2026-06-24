import { STATUSES, type Status } from '@rto/shared';

/** Pickable statuses in display order. */
export const STATUS_ORDER: readonly Status[] = STATUSES;

/** CSS modifier class for a status (paired with `.s-<status>` rules in app.css). */
export function statusClass(status: Status): string {
  return `s-${status}`;
}

/** A small glyph per status (used in cells + menus). */
export const STATUS_ICON: Record<Status, string> = {
  office: '🏢',
  remote: '🏠',
  vacation: '🌴',
  sick: '🤒',
  holiday: '🎉',
  travel: '✈️',
  oof: '🚫',
  none: '·',
};
