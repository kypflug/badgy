import { html, nothing } from 'lit';
import { currentWeekIndex } from '../lib/dates.js';
import { formatPct, formatWeekLabel } from '../lib/format.js';
import { applyTheme, getTheme, type Theme } from '../lib/theme.js';
import { store } from '../state/store.js';
import { RtoElement } from './base.js';

export class RtoSettings extends RtoElement {
  static override properties = { theme: { state: true } };
  theme: Theme = getTheme();

  private readonly onTarget = (e: Event): void => {
    store.setTarget(Number((e.target as HTMLInputElement).value));
  };

  private readonly onAddMeetup = (e: Event): void => {
    const sel = e.target as HTMLSelectElement;
    if (sel.value) {
      store.toggleMeetup(sel.value);
      sel.value = '';
    }
  };

  private setTheme(t: Theme): void {
    applyTheme(t);
    this.theme = t;
  }

  override render() {
    const target = store.settings.targetBelt;
    const year = store.year();
    const meetups = year.weeks.filter((w) => w.meetup);
    const nonMeetups = year.weeks.filter((w) => !w.meetup);
    const years = store.years;
    const nextYear = (years.at(-1) ?? store.activeYear) + 1;
    const idx = currentWeekIndex(year.weeks.map((w) => w.weekStart));

    return html`
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2 class="panel-title">Settings</h2>
            <p class="panel-sub">Tune your target, manage years, and mark MAI Meetup weeks.</p>
          </div>
        </div>

        <div class="settings-grid">
          <div class="mai-card setting-block">
            <h3 class="setting-title">Target BELT</h3>
            <p class="setting-help">Used by the planner and the dashboard band.</p>
            <label class="field">
              <span class="field-label">${formatPct(target)}</span>
              <input
                class="range"
                type="range"
                min="0.5"
                max="1"
                step="0.05"
                .value=${String(target)}
                @input=${this.onTarget}
              />
            </label>
          </div>

          <div class="mai-card setting-block">
            <h3 class="setting-title">Theme</h3>
            <p class="setting-help">Remembered on this device.</p>
            <div class="segmented" role="group" aria-label="Theme">
              <button
                class="segmented-option ${this.theme === 'light' ? 'is-active' : ''}"
                @click=${() => this.setTheme('light')}
              >
                ☀ Light
              </button>
              <button
                class="segmented-option ${this.theme === 'dark' ? 'is-active' : ''}"
                @click=${() => this.setTheme('dark')}
              >
                ☾ Dark
              </button>
            </div>
          </div>

          <div class="mai-card setting-block">
            <h3 class="setting-title">Years</h3>
            <p class="setting-help">Switch years or add the next one.</p>
            <div class="chip-row">
              ${years.map(
                (y) => html`<button
                  class="chip ${y === store.activeYear ? 'chip--active' : ''}"
                  @click=${() => store.setActiveYear(y)}
                >
                  ${y}
                </button>`,
              )}
              <button class="chip chip--add" @click=${() => store.addYear(nextYear)}>
                + ${nextYear}
              </button>
            </div>
          </div>

          <div class="mai-card setting-block setting-block--wide">
            <h3 class="setting-title">MAI Meetup weeks — ${year.year}</h3>
            <p class="setting-help">Highlighted in the tracker. They don't affect your score.</p>
            <div class="chip-row">
              ${
                meetups.length
                  ? meetups.map(
                      (w) => html`<button
                        class="chip chip--meetup"
                        title="Remove meetup highlight"
                        @click=${() => store.toggleMeetup(w.weekStart)}
                      >
                        ${formatWeekLabel(w.weekStart)} ✕
                      </button>`,
                    )
                  : html`<span class="setting-help">No meetup weeks marked.</span>`
              }
            </div>
            <label class="field field--inline add-meetup">
              <span class="field-label">Add</span>
              <select class="select" @change=${this.onAddMeetup}>
                <option value="">Pick a week…</option>
                ${nonMeetups.map(
                  (w) =>
                    html`<option value=${w.weekStart}>${formatWeekLabel(w.weekStart)}</option>`,
                )}
              </select>
            </label>
          </div>

          <div class="mai-card setting-block setting-block--wide">
            <h3 class="setting-title">Data</h3>
            <p class="setting-help">
              Saved privately in this browser. Sign-in and cross-device sync arrive with deployment.
              ${idx >= 0 ? html`Current week: <strong>${formatWeekLabel(year.weeks[idx].weekStart)}</strong>.` : nothing}
            </p>
            <button class="mai-button" @click=${() => store.resetActiveYear()}>
              Reset ${year.year} to default
            </button>
          </div>
        </div>
      </section>
    `;
  }
}

customElements.define('rto-settings', RtoSettings);
