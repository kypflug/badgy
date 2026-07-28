import { STATUS_LABEL, shiftMonth } from '@badgy/shared';
import { html, nothing } from 'lit';
import { type InteractiveAuthFlow, reconnect } from '../auth/provider.js';
import { isSettingsHistoryState, pushSettingsHistoryState } from '../lib/settings-history.js';
import { STATUS_ORDER } from '../lib/status.js';
import { toast } from '../lib/toast.js';
import { store } from '../state/store.js';
import { BadgyElement } from './base.js';
import './help-dialog.js';
import type { MonthChangeDetail, MonthScroller } from './month-scroller.js';
import './month-scroller.js';
import './score-rail.js';
import type { SettingsPage } from './settings-page.js';
import './settings-page.js';
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

export class BadgyApp extends BadgyElement {
  static override properties = {
    year: { state: true },
    month0: { state: true },
    activeDialog: { state: true },
    settingsOpen: { state: true },
    view: { state: true },
    reconnectStage: { state: true },
  };
  year: number;
  month0: number;
  activeDialog: 'help' | null = null;
  /**
   * Settings is an in-frame Workbench destination, not a dialog — it replaces the rail and pane
   * while open. `year`/`month0`/`view` are untouched while it's active, so leaving it always
   * returns to the same month/year view the user left. Entry pushes a same-URL history entry
   * (`settings-history.ts`) so browser Back leaves Settings without touching the workplace
   * URL/path or org routing; closing from inside Settings (back chevron / Escape) also goes
   * through `history.back()` so the stack never grows and Back behaves the same either way.
   */
  settingsOpen = false;
  view: CalendarView = 'month';
  reconnectStage = 'idle';
  private reconnectFlow: InteractiveAuthFlow | null = null;

  constructor() {
    super();
    const now = new Date();
    this.year = now.getFullYear();
    this.month0 = now.getMonth();
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
    const settings = this.settingsOpen ? this.querySelector<SettingsPage>('settings-page') : null;
    if (settings?.hasActivePolicyDraft()) return;
    e.preventDefault();
    if (k === 'y' || e.shiftKey) this.doRedo();
    else this.doUndo();
  };

  override connectedCallback(): void {
    super.connectedCallback();
    this.settingsOpen = isSettingsHistoryState(window.history.state);
    window.addEventListener('keydown', this.onKeydown);
    window.addEventListener('popstate', this.onPopState);
  }
  override disconnectedCallback(): void {
    window.removeEventListener('keydown', this.onKeydown);
    window.removeEventListener('popstate', this.onPopState);
    super.disconnectedCallback();
  }

  /**
   * A real popstate can arrive either from the user's own browser Back/Forward, or from our own
   * `history.back()` in `requestCloseSettings` (JS can't tell those apart). Either way, if Settings
   * is open and we've popped off its history marker, ask it whether that's OK — an open workplace
   * policy draft needs an explicit discard. If it says no, `history.forward()` re-lands on the
   * settings entry (which still exists — going back never drops forward entries) rather than
   * pushing a new one, so the stack stays exactly as it was and Settings stays open with its draft
   * intact.
   */
  private readonly onPopState = (e: PopStateEvent): void => {
    if (isSettingsHistoryState(e.state)) {
      this.settingsOpen = true;
      return;
    }
    if (!this.settingsOpen) return;
    const page = this.querySelector<SettingsPage>('settings-page');
    if (page && !page.confirmDiscardForClose()) {
      window.history.forward();
      return;
    }
    this.settingsOpen = false;
  };
  private openSettings(): void {
    this.settingsOpen = true;
    if (!isSettingsHistoryState(window.history.state)) pushSettingsHistoryState();
  }
  /** Settings' own back chevron / Escape route through here rather than closing directly. */
  private requestCloseSettings(): void {
    if (!this.settingsOpen) return;
    if (isSettingsHistoryState(window.history.state)) window.history.back();
    else this.settingsOpen = false;
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
  private setView(view: CalendarView): void {
    this.view = view;
  }
  private beginReconnect(): void {
    if (this.reconnectFlow?.snapshot.stage === 'blocked') {
      this.reconnectFlow.openProvider();
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
    return 'Reconnect';
  }

  override render() {
    const isYear = this.view === 'year';
    const periodTitle = isYear ? String(this.year) : `${MONTHS[this.month0]} ${this.year}`;
    return html`
      <div class="app" data-view=${this.view}>
        <div class="titlebar" aria-hidden="true"></div>
        <div class="workbench">
          ${
            this.settingsOpen
              ? html`<settings-page
                  style="display:contents"
                  @close=${() => this.requestCloseSettings()}
                ></settings-page>`
              : html`<score-rail
                    .view=${this.view}
                    .year=${this.year}
                    .month0=${this.month0}
                    .needsReconnect=${store.needsReconnect}
                    .isSyncUnavailable=${store.isSyncUnavailable}
                    .reconnecting=${
                      this.reconnectStage === 'starting' || this.reconnectStage === 'waiting'
                    }
                    .reconnectLabel=${this.reconnectLabel()}
                    .onReconnect=${() => this.beginReconnect()}
                    .onHelp=${() => {
                      this.activeDialog = 'help';
                    }}
                    .onSettings=${() => this.openSettings()}
                  ></score-rail>

                  <div class="pane">
                    <div class="view-bar">
                      <h1 class="view-title">${periodTitle}</h1>
                      <div class="step-group" role="group" aria-label=${isYear ? 'Year' : 'Month'}>
                        <button
                          class="step-btn"
                          @click=${() => this.nav(-1)}
                          aria-label=${isYear ? 'Previous year' : 'Previous month'}
                        >
                          ‹
                        </button>
                        <button
                          class="step-btn"
                          @click=${() => this.nav(1)}
                          aria-label=${isYear ? 'Next year' : 'Next month'}
                        >
                          ›
                        </button>
                      </div>
                      <button class="badgy-button today-btn" @click=${() => this.goToday()}>
                        Today
                      </button>
                      <span class="view-hint">
                        ${
                          isYear
                            ? 'Click or drag to set days · arrows change year'
                            : 'Drag any range to set it · wheel or flick to change month'
                        }
                      </span>
                      <div class="segmented view-switch" role="group" aria-label="Calendar view">
                        <button
                          type="button"
                          class="segmented-option ${isYear ? '' : 'is-active'}"
                          aria-label="Month"
                          aria-pressed=${isYear ? 'false' : 'true'}
                          @click=${() => this.setView('month')}
                        >
                          <span class="view-label-long">Month</span>
                          <span class="view-label-short" aria-hidden="true">M</span>
                        </button>
                        <button
                          type="button"
                          class="segmented-option ${isYear ? 'is-active' : ''}"
                          aria-label="Year"
                          aria-pressed=${isYear ? 'true' : 'false'}
                          @click=${() => this.setView('year')}
                        >
                          <span class="view-label-long">Year</span>
                          <span class="view-label-short" aria-hidden="true">Y</span>
                        </button>
                      </div>
                    </div>

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
                          html`<span class="legend-item"
                            ><span class="legend-swatch s-${s}" aria-hidden="true"></span
                            >${STATUS_LABEL[s]}</span
                          >`,
                      )}
                      <span class="legend-note">Filled bar = recorded · hollow = planned</span>
                    </div>
                  </div>`
          }
        </div>

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

customElements.define('badgy-app', BadgyApp);
