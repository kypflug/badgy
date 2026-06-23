import { beltBand } from '@rto/shared';
import { html, nothing } from 'lit';
import { formatPct } from '../lib/format.js';
import { getTheme, toggleTheme } from '../lib/theme.js';
import { getSession } from '../state/session.js';
import { store } from '../state/store.js';
import { RtoElement } from './base.js';
import './rto-tracker.js';
import './rto-dashboard.js';
import './rto-planner.js';
import './rto-settings.js';

type View = 'tracker' | 'dashboard' | 'plan' | 'settings';

const TABS: { id: View; label: string }[] = [
  { id: 'tracker', label: 'Tracker' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'plan', label: 'Plan' },
  { id: 'settings', label: 'Settings' },
];

export class RtoApp extends RtoElement {
  static override properties = {
    view: { state: true },
    theme: { state: true },
  };
  view: View = 'tracker';
  theme = getTheme();

  private latestBelt(): number | null {
    const computed = store.computed();
    for (let i = computed.length - 1; i >= 0; i--) {
      if (computed[i].belt != null) return computed[i].belt;
    }
    return null;
  }

  private readonly onYear = (e: Event): void => {
    store.setActiveYear(Number((e.target as HTMLSelectElement).value));
  };

  private readonly onTheme = (): void => {
    this.theme = toggleTheme();
  };

  private renderAuth() {
    const s = getSession();
    if (!s.apiAvailable) return nothing;
    if (s.me?.authenticated) {
      return html`<span class="user-chip" title=${s.me.email ?? ''}>${s.me.name ?? 'Signed in'}</span>
        <a
          class="mai-button mai-button--icon"
          href="/.auth/logout"
          title="Sign out"
          aria-label="Sign out"
          >⎋</a
        >`;
    }
    return html`<a class="mai-button" href="/.auth/login/aad?post_login_redirect_uri=/">Sign in</a>`;
  }

  override render() {
    const belt = this.latestBelt();
    return html`
      <div class="app">
        <header class="app-header">
          <div class="brand">
            <div class="brand-mark" aria-hidden="true"></div>
            <div>
              <h1 class="brand-title">Hybrid Attendance Modeler</h1>
              <p class="brand-tagline">Plan your office time against your rolling BELT score.</p>
            </div>
          </div>
          <div class="header-actions">
            ${this.renderAuth()}
            ${
              belt != null
                ? html`<div class="belt-chip belt-${beltBand(belt)}">
                    <span class="belt-chip-label">BELT</span>
                    <span class="belt-chip-value">${formatPct(belt)}</span>
                  </div>`
                : nothing
            }
            <label class="field field--inline">
              <span class="field-label">Year</span>
              <select class="select" @change=${this.onYear}>
                ${store.years.map(
                  (y) => html`<option value=${y} ?selected=${y === store.activeYear}>${y}</option>`,
                )}
              </select>
            </label>
            <button
              class="mai-button mai-button--icon"
              @click=${this.onTheme}
              title="Toggle light / dark"
              aria-label="Toggle light or dark theme"
            >
              ${this.theme === 'dark' ? '☾' : '☀'}
            </button>
          </div>
        </header>

        <nav class="tabs" role="tablist" aria-label="Views">
          ${TABS.map(
            (t) => html`<button
              role="tab"
              class="tab ${this.view === t.id ? 'tab--active' : ''}"
              aria-selected=${this.view === t.id}
              @click=${() => {
                this.view = t.id;
              }}
            >
              ${t.label}
            </button>`,
          )}
        </nav>

        <main class="view" role="tabpanel">
          ${this.view === 'tracker' ? html`<rto-tracker></rto-tracker>` : nothing}
          ${this.view === 'dashboard' ? html`<rto-dashboard></rto-dashboard>` : nothing}
          ${this.view === 'plan' ? html`<rto-planner></rto-planner>` : nothing}
          ${this.view === 'settings' ? html`<rto-settings></rto-settings>` : nothing}
        </main>

        <footer class="app-footer">
          BELT = average of your best 8 of the last 12 weeks' office days, as a % of a 5-day week.
        </footer>
      </div>
    `;
  }
}

customElements.define('rto-app', RtoApp);
