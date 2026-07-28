/**
 * Browser history plumbing for Settings-as-a-destination. Entering Settings pushes one same-URL
 * history entry marked with the Settings flag, so the browser Back button leaves Settings without
 * ever touching the workplace URL/path (org routing already cleaned the URL once on load in
 * `org/resolve.ts` — Settings must not disturb that). Closing via the in-page back control or
 * Escape also goes through `history.back()` (see `badgy-app.ts`) rather than a direct
 * `replaceState`, so the stack never grows unbounded and Back behaves identically no matter how
 * Settings was closed.
 */
const SETTINGS_HISTORY_FLAG = 'badgySettings';

export interface HistoryStatePusher {
  pushState(data: unknown, unused: string, url?: string | URL | null): void;
}

/** True when a `history.state` value is the marker Settings pushes when it opens. */
export function isSettingsHistoryState(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as Record<string, unknown>)[SETTINGS_HISTORY_FLAG] === true
  );
}

/** Push a same-URL history entry marking that Settings is open. */
export function pushSettingsHistoryState(target: HistoryStatePusher = window.history): void {
  target.pushState({ [SETTINGS_HISTORY_FLAG]: true }, '');
}
