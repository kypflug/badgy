import {
  HOLIDAY_REGIONS,
  type HolidayRegionId,
  isWeekend,
  STATUS_LABEL,
  type Status,
  WEEK_DAYS,
  type Weekday,
  weekStartsOfYear,
} from '@badgy/shared';
import { html, nothing } from 'lit';
import { type InteractiveAuthFlow, switchAccount } from '../auth/msal.js';
import { getSession } from '../auth/session.js';
import { formatPct, formatWeekLabel } from '../lib/format.js';
import { STATUS_ORDER } from '../lib/status.js';
import { applyMode, getMode, type ThemeMode } from '../lib/theme.js';
import { store } from '../state/store.js';
import { BadgyElement } from './base.js';

const THEME_MODES: { id: ThemeMode; label: string }[] = [
  { id: 'light', label: '☀ Light' },
  { id: 'dark', label: '☾ Dark' },
  { id: 'system', label: '⌁ System' },
];

const MAX_ICS_BYTES = 2_000_000;

const formatHolidayDate = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });

export class SettingsDialog extends BadgyElement {
  static override properties = {
    mode: { state: true },
    holidayYear: { state: true },
    holidayMsg: { state: true },
    accountStage: { state: true },
    accountMessage: { state: true },
  };
  mode: ThemeMode = getMode();
  holidayYear = new Date().getFullYear();
  holidayMsg = '';
  accountStage = 'idle';
  accountMessage = '';
  private accountFlow: InteractiveAuthFlow | null = null;

  private readonly onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.close();
  };

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('keydown', this.onKeydown);
  }
  override disconnectedCallback(): void {
    document.removeEventListener('keydown', this.onKeydown);
    super.disconnectedCallback();
  }

  private close(): void {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true }));
  }
  private setTheme(m: ThemeMode): void {
    applyMode(m);
    this.mode = m;
  }
  private setRegion(region: HolidayRegionId): void {
    store.setHolidayRegion(region);
    this.holidayMsg = '';
  }
  private addHoliday(value: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    if (store.isHoliday(value)) {
      this.holidayMsg = 'That date is already a holiday.';
      return;
    }
    store.addHoliday(value);
    this.holidayYear = Number(value.slice(0, 4));
    this.holidayMsg = '';
  }
  private resetHolidays(): void {
    store.resetHolidays();
    this.holidayMsg = 'Restored the region defaults.';
  }
  private async onImportIcs(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_ICS_BYTES) {
      this.holidayMsg = 'That file is too large — export a single year and try again.';
      return;
    }
    this.holidayMsg = 'Reading…';
    try {
      const { parseIcs } = await import('../lib/import-ics.js');
      const { holidays, skipped } = parseIcs(await file.text());
      const added = store.importHolidays(holidays);
      const skippedNote = skipped ? `, skipped ${skipped} undated` : '';
      this.holidayMsg = added
        ? `Added ${added} holiday${added === 1 ? '' : 's'}${skippedNote}.`
        : `No new dates to add${skippedNote}.`;
      if (added && holidays[0]) this.holidayYear = Number(holidays[0].date.slice(0, 4));
    } catch (err) {
      this.holidayMsg =
        err instanceof Error && err.message ? err.message : "Couldn't read that .ics file.";
    }
  }
  private beginAccountSwitch(): void {
    this.accountMessage = '';
    if (this.accountFlow?.snapshot.stage === 'blocked') {
      this.accountFlow.openMicrosoft();
      this.accountStage = this.accountFlow.snapshot.stage;
      return;
    }
    const flow = switchAccount();
    this.accountFlow = flow;
    const update = (): void => {
      this.accountStage = flow.snapshot.stage;
    };
    flow.addEventListener('change', update);
    update();
    void flow.completion
      .then(() => window.location.reload())
      .catch(() => {
        this.accountStage = 'failed';
      });
  }
  private async endSession(): Promise<void> {
    const session = getSession();
    if (!session) return;
    this.accountMessage = 'Signing out…';
    const complete = await session.signOut();
    if (!complete)
      this.accountMessage = 'Sign-out could not reach the server. Try again when connected.';
  }
  private accountSwitchLabel(): string {
    if (this.accountStage === 'starting') return 'Preparing…';
    if (this.accountStage === 'waiting') return 'Finish in Microsoft…';
    if (this.accountStage === 'blocked') return 'Open Microsoft sign-in';
    if (this.accountStage === 'failed') return 'Try switching again';
    return 'Use another account';
  }

  override render() {
    const session = getSession();
    const pattern = store.pattern;
    const year = new Date().getFullYear();
    const weekStarts = weekStartsOfYear(year);
    const meetups = weekStarts.filter((weekStart) => store.isMeetupWeek(weekStart));
    const nonMeetups = weekStarts.filter((weekStart) => !store.isMeetupWeek(weekStart));
    const region = store.holidayRegion;
    const regionNote = HOLIDAY_REGIONS.find((r) => r.id === region)?.note;
    const holidays = store.holidaysInYear(this.holidayYear);

    return html`
      <div class="dialog-backdrop" @click=${() => this.close()}></div>
      <div class="dialog badgy-card" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header class="dialog-head">
          <h2 class="dialog-title" id="settings-title">Settings</h2>
          <button class="badgy-button badgy-button--icon" @click=${() => this.close()} aria-label="Close">✕</button>
        </header>

        <section class="setting">
          <h3 class="setting-title">Your usual week</h3>
          <p class="setting-help">Default for any day you haven't set. Specific dates override this.</p>
          <div class="pattern-grid">
            ${WEEK_DAYS.map(
              (w) => html`<label class="pattern-day">
                <span class="pattern-dow">${w.short}</span>
                <select
                  class="select"
                  @change=${(e: Event) =>
                    store.setPattern(
                      w.idx as Weekday,
                      (e.target as HTMLSelectElement).value as Status,
                    )}
                >
                  ${(isWeekend(w.idx) ? [...STATUS_ORDER, 'none' as const] : STATUS_ORDER).map(
                    (s) => html`<option
                      value=${s}
                      ?selected=${(pattern[w.idx] ?? (isWeekend(w.idx) ? 'none' : 'office')) === s}
                    >
                      ${STATUS_LABEL[s]}
                    </option>`,
                  )}
                </select>
              </label>`,
            )}
          </div>
        </section>

        <section class="setting">
          <h3 class="setting-title">Target BELT — ${formatPct(store.target)}</h3>
          <p class="setting-help">Drives the "on track?" indicator and the planner.</p>
          <input
            class="range"
            type="range"
            min="0.5"
            max="1"
            step="0.05"
            .value=${String(store.target)}
            @input=${(e: Event) => store.setTarget(Number((e.target as HTMLInputElement).value))}
          />
        </section>

        <section class="setting">
          <h3 class="setting-title">Theme</h3>
          <div class="segmented" role="group" aria-label="Theme">
            ${THEME_MODES.map(
              (t) => html`<button
                class="segmented-option ${this.mode === t.id ? 'is-active' : ''}"
                @click=${() => this.setTheme(t.id)}
              >
                ${t.label}
              </button>`,
            )}
          </div>
        </section>

        <section class="setting">
          <h3 class="setting-title">Meetup weeks — ${year}</h3>
          <p class="setting-help">Highlighted on the calendar; they don't affect BELT.</p>
          <div class="chip-row">
            ${
              meetups.length
                ? meetups.map(
                    (
                      m,
                    ) => html`<button class="chip chip--meetup" @click=${() => store.toggleMeetup(m)}>
                    ${formatWeekLabel(m)} ✕
                  </button>`,
                  )
                : html`<span class="setting-help">None marked.</span>`
            }
          </div>
          <label class="field field--inline">
            <span class="field-label">Add</span>
            <select
              class="select"
              @change=${(e: Event) => {
                const v = (e.target as HTMLSelectElement).value;
                if (v) store.toggleMeetup(v);
                (e.target as HTMLSelectElement).value = '';
              }}
            >
              <option value="">Pick a week…</option>
              ${nonMeetups.map((m) => html`<option value=${m}>${formatWeekLabel(m)}</option>`)}
            </select>
          </label>
        </section>

        <section class="setting">
          <h3 class="setting-title">Holidays</h3>
          <p class="setting-help">
            Holidays fill in automatically and never count toward BELT. Pick the set that matches
            your organization, then add or remove individual days.
          </p>
          <label class="field field--inline">
            <span class="field-label">Region</span>
            <select
              class="select"
              @change=${(e: Event) =>
                this.setRegion((e.target as HTMLSelectElement).value as HolidayRegionId)}
            >
              ${HOLIDAY_REGIONS.map(
                (r) => html`<option value=${r.id} ?selected=${r.id === region}>${r.label}</option>`,
              )}
            </select>
          </label>
          ${regionNote ? html`<p class="setting-help">${regionNote}</p>` : nothing}

          <div class="field field--inline">
            <span class="field-label">Year</span>
            <div class="chip-row">
              <button
                class="badgy-button badgy-button--icon"
                aria-label="Previous year"
                @click=${() => {
                  this.holidayYear--;
                }}
              >
                ‹
              </button>
              <span class="setting-value">${this.holidayYear}</span>
              <button
                class="badgy-button badgy-button--icon"
                aria-label="Next year"
                @click=${() => {
                  this.holidayYear++;
                }}
              >
                ›
              </button>
            </div>
          </div>

          <div class="chip-row">
            ${
              holidays.length
                ? holidays.map(
                    (h) => html`<button
                      class="chip chip--holiday"
                      title=${`${h.name} — remove`}
                      @click=${() => store.removeHoliday(h.date)}
                    >
                      ${formatHolidayDate(h.date)} ${h.name} ✕
                    </button>`,
                  )
                : html`<span class="setting-help">No holidays in ${this.holidayYear}.</span>`
            }
          </div>

          <div class="chip-row">
            <label class="field field--inline">
              <span class="field-label">Add</span>
              <input
                class="select"
                type="date"
                @change=${(e: Event) => {
                  const input = e.target as HTMLInputElement;
                  this.addHoliday(input.value);
                  input.value = '';
                }}
              />
            </label>
            <label class="badgy-button import-button">
              Import .ics…
              <input
                type="file"
                accept=".ics,text/calendar"
                @change=${(e: Event) => void this.onImportIcs(e)}
                hidden
              />
            </label>
            <button class="badgy-button" @click=${() => this.resetHolidays()}>
              Reset to defaults
            </button>
          </div>
          ${this.holidayMsg ? html`<p class="setting-help">${this.holidayMsg}</p>` : nothing}
        </section>

        ${
          session
            ? html`<section class="setting">
              <h3 class="setting-title">Account</h3>
              <p class="setting-help">
                Signed in as <strong>${session.name}</strong>. Your data lives in your OneDrive.
              </p>
              <div class="chip-row">
                <button
                  class="badgy-button"
                  @click=${() => this.beginAccountSwitch()}
                  ?disabled=${this.accountStage === 'starting' || this.accountStage === 'waiting'}
                >
                  ${this.accountSwitchLabel()}
                </button>
                <button class="badgy-button" @click=${() => void this.endSession()}>Sign out</button>
              </div>
              ${
                this.accountMessage
                  ? html`<p class="setting-help" role="status">${this.accountMessage}</p>`
                  : nothing
              }
            </section>`
            : nothing
        }
      </div>
    `;
  }
}

customElements.define('settings-dialog', SettingsDialog);
