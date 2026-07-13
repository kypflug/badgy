import { beltBand, STATUS_LABEL, shiftMonth } from '@rto/shared';
import { html, nothing } from 'lit';
import { type InteractiveAuthFlow, reconnect } from '../auth/msal.js';
import { getSession } from '../auth/session.js';
import { formatPct } from '../lib/format.js';
import { STATUS_ICON, STATUS_ORDER } from '../lib/status.js';
import { toast } from '../lib/toast.js';
import { store } from '../state/store.js';
import { RtoElement } from './base.js';
import './compliance-bar.js';
import './help-dialog.js';
import type { MonthChangeDetail, MonthScroller } from './month-scroller.js';
import './month-scroller.js';
import './settings-dialog.js';
import './year-planner.js';

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
type CalendarView = 'month' | 'year';

export class RtoApp extends RtoElement {
  static override properties = {
    year: { state: true },
    month0: { state: true },
    activeDialog: { state: true },
    zoom: { state: true },
    view: { state: true },
    reconnectStage: { state: true },
  };
  year: number;
  month0: number;
  activeDialog: 'help' | 'settings' | null = null;
  zoom = 1;
  view: CalendarView = 'month';
  reconnectStage = 'idle';
  private reconnectFlow: InteractiveAuthFlow | null = null;

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
    if (this.view === 'year') {
      this.year += delta;
      return;
    }
    const scroller = this.querySelector<MonthScroller>('month-scroller');
    if (scroller) void scroller.navigate(delta);
    else {
      const next = shiftMonth(this.year, this.month0, delta);
      this.year = next.year;
      this.month0 = next.month0;
    }
  }
  private goToday(): void {
    const now = new Date();
    const year = now.getFullYear();
    const month0 = now.getMonth();
    if (this.view === 'year') {
      this.year = year;
      this.month0 = month0;
      return;
    }
    const scroller = this.querySelector<MonthScroller>('month-scroller');
    if (scroller) void scroller.jumpTo(year, month0);
    else {
      this.year = year;
      this.month0 = month0;
    }
  }
  private readonly onMonthChange = (event: CustomEvent<MonthChangeDetail>): void => {
    this.year = event.detail.year;
    this.month0 = event.detail.month0;
  };
  private statusPill() {
    const c = store.compliance();
    if (c.current == null) return nothing;
    const band = beltBand(c.current);
    const onTrack = c.current + 1e-9 >= c.target;
    const label = onTrack ? 'On track' : c.current >= c.target - 0.1 ? 'At risk' : 'Off track';
    return html`<span
      class="status-pill belt-${band}"
      title="BELT ${formatPct(c.current)} · target ${formatPct(c.target)}"
    >
      <span class="status-dot"></span>${label} · ${formatPct(c.current)}
    </span>`;
  }
  private setZoom(delta: number): void {
    const z = Math.min(2, Math.max(0, this.zoom + delta));
    if (z !== this.zoom) {
      this.zoom = z;
      localStorage.setItem('badgy.zoom', String(z));
    }
  }
  private setView(view: CalendarView): void {
    this.view = view;
  }
  private beginReconnect(): void {
    if (this.reconnectFlow?.snapshot.stage === 'blocked') {
      this.reconnectFlow.openMicrosoft();
      this.reconnectStage = this.reconnectFlow.snapshot.stage;
      return;
    }
    const flow = reconnect();
    this.reconnectFlow = flow;
    const update = (): void => {
      this.reconnectStage = flow.snapshot.stage;
    };
    flow.addEventListener('change', update);
    update();
    void flow.completion
      .then(() => window.location.reload())
      .catch(() => {
        this.reconnectStage = 'failed';
      });
  }
  private reconnectLabel(): string {
    if (this.reconnectStage === 'starting') return 'Preparing…';
    if (this.reconnectStage === 'waiting') return 'Finish sign-in…';
    if (this.reconnectStage === 'blocked') return 'Open sign-in';
    if (this.reconnectStage === 'failed') return 'Try reconnect';
    return '⟳ Reconnect';
  }

  override render() {
    const session = getSession();
    const isYear = this.view === 'year';
    const periodTitle = isYear ? String(this.year) : `${MONTHS[this.month0]} ${this.year}`;
    return html`
      <div class="app" data-zoom=${['s', 'm', 'l'][this.zoom]} data-view=${this.view}>
        <div class="titlebar" aria-hidden="true"></div>
        <header class="app-bar">
          <div class="brand">
            <div class="brand-mark" aria-hidden="true"></div>
            <span class="brand-name">Badgy</span>
          </div>
          <div class="segmented view-switch" role="group" aria-label="Calendar view">
            <button
              type="button"
              class="segmented-option ${isYear ? '' : 'is-active'}"
              aria-pressed=${isYear ? 'false' : 'true'}
              @click=${() => this.setView('month')}
            >
              Month
            </button>
            <button
              type="button"
              class="segmented-option ${isYear ? 'is-active' : ''}"
              aria-pressed=${isYear ? 'true' : 'false'}
              @click=${() => this.setView('year')}
            >
              Year
            </button>
          </div>
          <div class="month-nav">
            <button
              class="nav-btn"
              @click=${() => this.nav(-1)}
              aria-label=${isYear ? 'Previous year' : 'Previous month'}
            >
              ‹
            </button>
            <span class="month-title">${periodTitle}</span>
            <button
              class="nav-btn"
              @click=${() => this.nav(1)}
              aria-label=${isYear ? 'Next year' : 'Next month'}
            >
              ›
            </button>
            <button class="mai-button today-btn" @click=${() => this.goToday()}>Today</button>
          </div>
          <div class="app-bar-actions">
            ${
              store.needsReconnect
                ? html`<button
                    class="reconnect-pill"
                    @click=${() => this.beginReconnect()}
                    ?disabled=${
                      this.reconnectStage === 'starting' || this.reconnectStage === 'waiting'
                    }
                    title="Your changes aren't syncing to OneDrive. Tap to reconnect."
                  >
                    ${this.reconnectLabel()}
                  </button>`
                : store.isSyncUnavailable
                  ? html`<span
                      class="offline-pill"
                      title="Badgy is using your local cache and will retry OneDrive automatically."
                      >Offline</span
                    >`
                  : nothing
            }
            <div class="zoom-group" role="group" aria-label="Edit history">
              <button class="nav-btn" @click=${() => this.doUndo()} ?disabled=${!store.canUndo} aria-label="Undo" title="Undo (Ctrl/⌘ Z)">↶</button>
              <button class="nav-btn" @click=${() => this.doRedo()} ?disabled=${!store.canRedo} aria-label="Redo" title="Redo (Ctrl/⌘ ⇧ Z)">↷</button>
            </div>
            ${
              isYear
                ? nothing
                : html`<div class="zoom-group" role="group" aria-label="Calendar zoom">
                    <button class="nav-btn" @click=${() => this.setZoom(-1)} ?disabled=${this.zoom === 0} aria-label="Zoom out" title="Smaller cells">−</button>
                    <button class="nav-btn" @click=${() => this.setZoom(1)} ?disabled=${this.zoom === 2} aria-label="Zoom in" title="Larger cells">+</button>
                  </div>`
            }
            ${this.statusPill()}
            <button
              class="mai-button mai-button--icon"
              @click=${() => {
                this.activeDialog = 'help';
              }}
              aria-label="Help"
              title="Help"
            >
              ?
            </button>
            <button
              class="mai-button mai-button--icon"
              @click=${() => {
                this.activeDialog = 'settings';
              }}
              aria-label="Settings"
              title="Settings"
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

        ${isYear ? nothing : html`<compliance-bar></compliance-bar>`}

        <main class="cal-main">
          ${
            isYear
              ? html`<year-planner .year=${this.year}></year-planner>`
              : html`<month-scroller
                  .year=${this.year}
                  .month0=${this.month0}
                  @month-change=${this.onMonthChange}
                ></month-scroller>`
          }
        </main>

        <div class="legend">
          ${STATUS_ORDER.map(
            (s) =>
              html`<span class="legend-item"><span class="legend-swatch s-${s}">${STATUS_ICON[s]}</span>${STATUS_LABEL[s]}</span>`,
          )}
          <span class="legend-item legend-item--hint">
            ${
              isYear
                ? 'Click or drag to set days · arrows change year'
                : 'Click or drag to set days · wheel or flick to change month'
            }
          </span>
        </div>

        ${
          this.activeDialog === 'settings'
            ? html`<settings-dialog @close=${() => {
                this.activeDialog = null;
              }}></settings-dialog>`
            : nothing
        }
        ${
          this.activeDialog === 'help'
            ? html`<help-dialog @close=${() => {
                this.activeDialog = null;
              }}></help-dialog>`
            : nothing
        }
      </div>
    `;
  }
}

customElements.define('rto-app', RtoApp);
