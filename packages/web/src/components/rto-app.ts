import { STATUS_LABEL, type Status } from '@rto/shared';
import { html, nothing } from 'lit';
import { getSession } from '../auth/session.js';
import { applyMode, currentTheme } from '../lib/theme.js';
import { RtoElement } from './base.js';
import './compliance-bar.js';
import './month-calendar.js';
import './settings-dialog.js';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const LEGEND: Status[] = ['office', 'remote', 'vacation', 'sick', 'holiday', 'travel', 'oof'];

export class RtoApp extends RtoElement {
  static override properties = {
    year: { state: true },
    month0: { state: true },
    settingsOpen: { state: true },
  };
  year: number;
  month0: number;
  settingsOpen = false;

  constructor() {
    super();
    const now = new Date();
    this.year = now.getFullYear();
    this.month0 = now.getMonth();
  }

  private nav(delta: number): void {
    let m = this.month0 + delta;
    let y = this.year;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    this.month0 = m;
    this.year = y;
  }
  private goToday(): void {
    const now = new Date();
    this.year = now.getFullYear();
    this.month0 = now.getMonth();
  }
  private quickTheme(): void {
    applyMode(currentTheme() === 'dark' ? 'light' : 'dark');
    this.requestUpdate();
  }

  override render() {
    const session = getSession();
    return html`
      <div class="app">
        <header class="app-bar">
          <div class="brand">
            <div class="brand-mark" aria-hidden="true"></div>
            <span class="brand-name">Badgy</span>
          </div>
          <div class="month-nav">
            <button class="nav-btn" @click=${() => this.nav(-1)} aria-label="Previous month">‹</button>
            <span class="month-title">${MONTHS[this.month0]} ${this.year}</span>
            <button class="nav-btn" @click=${() => this.nav(1)} aria-label="Next month">›</button>
            <button class="mai-button today-btn" @click=${() => this.goToday()}>Today</button>
          </div>
          <div class="app-bar-actions">
            <button class="mai-button mai-button--icon" @click=${() => this.quickTheme()} aria-label="Toggle theme">
              ${currentTheme() === 'dark' ? '☾' : '☀'}
            </button>
            <button
              class="mai-button mai-button--icon"
              @click=${() => {
                this.settingsOpen = true;
              }}
              aria-label="Settings"
            >
              ⚙
            </button>
            ${
              session
                ? html`<span class="user-chip" title=${session.email}>${session.name}</span>`
                : nothing
            }
          </div>
        </header>

        <compliance-bar></compliance-bar>

        <main class="cal-main">
          <month-calendar .year=${this.year} .month0=${this.month0}></month-calendar>
        </main>

        <div class="legend">
          ${LEGEND.map(
            (s) =>
              html`<span class="legend-item"><span class="legend-swatch s-${s}"></span>${STATUS_LABEL[s]}</span>`,
          )}
          <span class="legend-item legend-item--hint">Click a day to set it · past solid, future outlined</span>
        </div>

        ${
          this.settingsOpen
            ? html`<settings-dialog @close=${() => {
                this.settingsOpen = false;
              }}></settings-dialog>`
            : nothing
        }
      </div>
    `;
  }
}

customElements.define('rto-app', RtoApp);
