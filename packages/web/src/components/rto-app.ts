import { STATUS_LABEL, type Status } from '@rto/shared';
import { html, nothing } from 'lit';
import { reconnect } from '../auth/msal.js';
import { getSession } from '../auth/session.js';
import { STATUS_ICON } from '../lib/status.js';
import { applyMode, currentTheme } from '../lib/theme.js';
import { toast } from '../lib/toast.js';
import { store } from '../state/store.js';
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
    zoom: { state: true },
  };
  year: number;
  month0: number;
  settingsOpen = false;
  zoom = 1;

  constructor() {
    super();
    const now = new Date();
    this.year = now.getFullYear();
    this.month0 = now.getMonth();
    const raw = localStorage.getItem('badgy.zoom');
    const z = raw === null ? 1 : Number(raw);
    this.zoom = z === 0 || z === 1 || z === 2 ? z : 1;
  }

  private doUndo(): void {
    if (store.undo()) toast('Undone');
  }
  private doRedo(): void {
    if (store.redo()) toast('Redone');
  }

  private readonly onKeydown = (e: KeyboardEvent): void => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k !== 'z' && k !== 'y') return;
    const el = e.target as HTMLElement | null;
    if (el && (/^(input|select|textarea)$/i.test(el.tagName) || el.isContentEditable)) return;
    e.preventDefault();
    if (k === 'y' || e.shiftKey) this.doRedo();
    else this.doUndo();
  };

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('keydown', this.onKeydown);
  }
  override disconnectedCallback(): void {
    window.removeEventListener('keydown', this.onKeydown);
    super.disconnectedCallback();
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
  private setZoom(delta: number): void {
    const z = Math.min(2, Math.max(0, this.zoom + delta));
    if (z !== this.zoom) {
      this.zoom = z;
      localStorage.setItem('badgy.zoom', String(z));
    }
  }

  override render() {
    const session = getSession();
    return html`
      <div class="app" data-zoom=${['s', 'm', 'l'][this.zoom]}>
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
            ${
              store.needsReconnect
                ? html`<button class="reconnect-pill" @click=${() => reconnect()} title="Your changes aren't syncing to OneDrive. Tap to reconnect.">⟳ Reconnect</button>`
                : nothing
            }
            <div class="zoom-group" role="group" aria-label="Edit history">
              <button class="nav-btn" @click=${() => this.doUndo()} ?disabled=${!store.canUndo} aria-label="Undo" title="Undo (Ctrl/⌘ Z)">↶</button>
              <button class="nav-btn" @click=${() => this.doRedo()} ?disabled=${!store.canRedo} aria-label="Redo" title="Redo (Ctrl/⌘ ⇧ Z)">↷</button>
            </div>
            <div class="zoom-group" role="group" aria-label="Calendar zoom">
              <button class="nav-btn" @click=${() => this.setZoom(-1)} ?disabled=${this.zoom === 0} aria-label="Zoom out" title="Smaller cells">−</button>
              <button class="nav-btn" @click=${() => this.setZoom(1)} ?disabled=${this.zoom === 2} aria-label="Zoom in" title="Larger cells">+</button>
            </div>
            <button class="mai-button mai-button--icon theme-toggle" @click=${() => this.quickTheme()} aria-label="Toggle theme">
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
              html`<span class="legend-item"><span class="legend-swatch s-${s}">${STATUS_ICON[s]}</span>${STATUS_LABEL[s]}</span>`,
          )}
          <span class="legend-item legend-item--hint">Click or drag to set days · past filled, future dashed</span>
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
