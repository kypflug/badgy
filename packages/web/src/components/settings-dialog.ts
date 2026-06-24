import { mondaysOfYear, STATUS_LABEL, type Status, WEEKDAYS, type Weekday } from '@rto/shared';
import { html, nothing } from 'lit';
import { getSession } from '../auth/session.js';
import { formatPct, formatWeekLabel } from '../lib/format.js';
import { STATUS_ORDER } from '../lib/status.js';
import { applyMode, getMode, type ThemeMode } from '../lib/theme.js';
import { store } from '../state/store.js';
import { RtoElement } from './base.js';

const THEME_MODES: { id: ThemeMode; label: string }[] = [
  { id: 'light', label: '☀ Light' },
  { id: 'dark', label: '☾ Dark' },
  { id: 'system', label: '⌁ System' },
];

export class SettingsDialog extends RtoElement {
  static override properties = { mode: { state: true } };
  mode: ThemeMode = getMode();

  private close(): void {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true }));
  }
  private setTheme(m: ThemeMode): void {
    applyMode(m);
    this.mode = m;
  }

  override render() {
    const session = getSession();
    const pattern = store.pattern;
    const year = new Date().getFullYear();
    const meetups = mondaysOfYear(year).filter((m) => store.isMeetupWeek(m));
    const nonMeetups = mondaysOfYear(year).filter((m) => !store.isMeetupWeek(m));

    return html`
      <div class="dialog-backdrop" @click=${() => this.close()}></div>
      <div class="dialog mai-card" role="dialog" aria-label="Settings">
        <header class="dialog-head">
          <h2 class="dialog-title">Settings</h2>
          <button class="mai-button mai-button--icon" @click=${() => this.close()} aria-label="Close">✕</button>
        </header>

        <section class="setting">
          <h3 class="setting-title">Your usual week</h3>
          <p class="setting-help">Default for any weekday you haven't set. Specific days override this.</p>
          <div class="pattern-grid">
            ${WEEKDAYS.map(
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
                  ${STATUS_ORDER.map(
                    (s) => html`<option value=${s} ?selected=${(pattern[w.idx] ?? 'office') === s}>
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

        ${
          session
            ? html`<section class="setting">
              <h3 class="setting-title">Account</h3>
              <p class="setting-help">
                Signed in as <strong>${session.name}</strong>. Your data lives in your OneDrive.
              </p>
              <button class="mai-button" @click=${() => session.signOut()}>Sign out</button>
            </section>`
            : nothing
        }
      </div>
    `;
  }
}

customElements.define('settings-dialog', SettingsDialog);
