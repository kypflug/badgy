import {
  addDays,
  type ComplianceResult,
  countStatuses,
  type PeriodScore,
  STATUS_LABEL,
  type StatusCounts,
} from '@badgy/shared';
import { html, nothing, svg } from 'lit';
import { getSession } from '../auth/session.js';
import { computeAwayBands, seriesPoints, xFraction } from '../lib/forecast.js';
import { formatPct, initialsFor } from '../lib/format.js';
import { STATUS_ORDER, statusClass } from '../lib/status.js';
import { store } from '../state/store.js';
import { BadgyElement } from './base.js';

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
const PLOT_W = 236;
const PLOT_H = 104;

export type RailView = 'month' | 'year';

/**
 * The persistent left rail: brand, score, target progress, the recorded/forecast chart, current
 * period totals, and account/sync/help/settings — mounted once and never remounted when the pane
 * swaps between Month and Year.
 */
export class ScoreRail extends BadgyElement {
  static override properties = {
    view: { type: String },
    year: { type: Number },
    month0: { type: Number },
    reconnecting: { type: Boolean },
    needsReconnect: { type: Boolean },
    isSyncUnavailable: { type: Boolean },
    reconnectLabel: { type: String },
  };

  view: RailView = 'month';
  year = 0;
  month0 = 0;
  reconnecting = false;
  needsReconnect = false;
  isSyncUnavailable = false;
  reconnectLabel = 'Reconnect';

  onReconnect: () => void = () => {};
  onHelp: () => void = () => {};
  onSettings: () => void = () => {};

  private statusLabel(c: ComplianceResult, noQuota: boolean): string {
    if (c.current == null) return 'Getting started';
    if (noQuota) return 'No requirement';
    const onTrack = c.current + 1e-9 >= c.target;
    if (onTrack) return 'On track';
    return c.current >= c.target - 0.1 ? 'At risk' : 'Off track';
  }

  private targetCopy(c: ComplianceResult, noQuota: boolean): string {
    if (noQuota) return store.org.summary;
    if (c.current == null) return 'building your first weeks';
    const pts = Math.round((c.current - c.target) * 100);
    if (pts > 0) return `${pts} pts above target`;
    if (pts < 0) return `${-pts} pts below target`;
    return 'right at target';
  }

  private forecast(c: ComplianceResult, band: string) {
    const today = store.today();
    const domainStart = c.series[0]?.start ?? today;
    const domainEnd = c.futureSeries.at(-1)?.end ?? c.series.at(-1)?.end ?? today;
    const currentEnd = c.series.at(-1)?.end ?? today;

    const pastPoints = seriesPoints(c.series, domainStart, domainEnd, PLOT_W, PLOT_H);
    const futureSeed: Pick<PeriodScore, 'end' | 'score'>[] =
      c.current == null ? [] : [{ end: currentEnd, score: c.current }];
    const futurePoints = seriesPoints(
      [...futureSeed, ...c.futureSeries],
      domainStart,
      domainEnd,
      PLOT_W,
      PLOT_H,
    );

    const days = store.rangeDays(domainStart, domainEnd);
    const notes = store.notesInRange(domainStart, domainEnd);
    const awayBands = computeAwayBands(days, notes);

    const targetY = PLOT_H * (1 - Math.min(1, c.target));
    const nowX = xFraction(currentEnd, domainStart, domainEnd) * PLOT_W;
    const nowY = c.current == null ? PLOT_H : PLOT_H * (1 - Math.min(1, c.current));

    const withScore = [...c.series, ...c.futureSeries].filter(
      (p): p is PeriodScore & { score: number } => p.score != null,
    );
    const low = withScore.reduce<PeriodScore | null>(
      (min, p) => (min == null || (p.score ?? 1) < (min.score ?? 1) ? p : min),
      null,
    );
    const end = c.futureSeries.at(-1) ?? c.series.at(-1) ?? null;
    const horizonLabel = end?.label ?? '';

    return html`
      <div class="rail-forecast">
        <div class="rail-forecast-head">
          <span>Forecast</span>
          <span>${horizonLabel ? `to ${horizonLabel}` : ''}</span>
        </div>
        <svg class="rail-forecast-svg" viewBox="0 0 ${PLOT_W} ${PLOT_H}" aria-hidden="true">
          <rect x="0" y="0" width=${PLOT_W} height=${PLOT_H} rx="6" class="rail-forecast-plot" />
          ${awayBands.map((b) => {
            const x1 = xFraction(b.startDate, domainStart, domainEnd) * PLOT_W;
            const x2 = Math.max(
              x1 + 2,
              xFraction(addDays(b.endDate, 1), domainStart, domainEnd) * PLOT_W,
            );
            return svg`<g>
              <rect x=${x1} y="0" width=${x2 - x1} height=${PLOT_H} class="rail-forecast-away" />
              ${
                b.label
                  ? svg`<text x=${(x1 + x2) / 2} y=${PLOT_H - 6} class="rail-forecast-away-label" text-anchor="middle">${b.label}</text>`
                  : nothing
              }
            </g>`;
          })}
          <line
            x1="0" x2=${PLOT_W} y1=${targetY} y2=${targetY}
            class="rail-forecast-target"
          />
          ${
            pastPoints
              ? svg`<polyline points=${pastPoints} class="rail-forecast-line rail-forecast-line--past score-${band}" />`
              : nothing
          }
          ${
            futurePoints
              ? svg`<polyline points=${futurePoints} class="rail-forecast-line rail-forecast-line--future score-${band}" />`
              : nothing
          }
          ${
            c.current != null
              ? svg`<circle cx=${nowX} cy=${nowY} r="3.5" class="rail-forecast-now score-${band}" />`
              : nothing
          }
        </svg>
        <div class="rail-forecast-footer">
          ${
            low
              ? html`<span
                  >Low point <strong class="rail-forecast-low">${formatPct(low.score)}</strong> ·
                  ${low.label}</span
                >`
              : html`<span></span>`
          }
          ${
            end ? html`<span>${end.label} <strong>${formatPct(end.score)}</strong></span>` : nothing
          }
        </div>
      </div>
    `;
  }

  private totals() {
    const isYear = this.view === 'year';
    const counts: StatusCounts = isYear
      ? countStatuses(store.yearDays(this.year))
      : countStatuses(
          store
            .monthDays(this.year, this.month0)
            .filter((d) => Number(d.date.slice(5, 7)) - 1 === this.month0),
        );
    const max = Math.max(1, ...STATUS_ORDER.map((s) => counts[s]));
    const eyebrow = isYear ? `${this.year} totals` : `${MONTHS[this.month0]} so far`;
    return html`
      <div class="rail-totals">
        <span class="rail-totals-eyebrow">${eyebrow}</span>
        ${STATUS_ORDER.filter((s) => counts[s] > 0).map(
          (s) => html`
            <div class="rail-total-row">
              <span class="rail-total-swatch ${statusClass(s)}" aria-hidden="true"></span>
              <span class="rail-total-label">${STATUS_LABEL[s]}</span>
              <strong class="rail-total-count">${counts[s]}</strong>
              <span class="rail-total-bar" aria-hidden="true"
                ><span
                  class="rail-total-bar-fill ${statusClass(s)}"
                  style="width:${(counts[s] / max) * 100}%"
                ></span
              ></span>
            </div>
          `,
        )}
      </div>
    `;
  }

  override render() {
    const c = store.compliance();
    const noQuota = store.scheme.kind === 'none';
    const band = c.current == null ? '' : store.band(c.current);
    const session = getSession();

    return html`
      <aside class="rail" data-view=${this.view} aria-label="Compliance rail">
        <div class="rail-brand">
          <span class="brand-mark rail-mark" aria-hidden="true"></span>
          <span class="brand-name rail-brand-name">Badgy</span>
          <span class="rail-mobile-actions">
            <button
              class="badgy-button badgy-button--icon"
              @click=${() => this.onHelp()}
              aria-label="Help"
              title="Help"
            >
              ?
            </button>
            <button
              class="badgy-button badgy-button--icon"
              @click=${() => this.onSettings()}
              aria-label="Settings"
              title="Settings"
            >
              <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                <path
                  d="M8.3 2.2h3.4l.5 2a6.2 6.2 0 0 1 1.1.7l2-.6 1.7 3-1.5 1.4a6 6 0 0 1 0 1.3l1.5 1.4-1.7 3-2-.6a6.2 6.2 0 0 1-1.1.7l-.5 2H8.3l-.5-2a6.2 6.2 0 0 1-1.1-.7l-2 .6-1.7-3L4.5 10a6 6 0 0 1 0-1.3L3 7.3l1.7-3 2 .6a6.2 6.2 0 0 1 1.1-.7l.5-2Z"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.35"
                  stroke-linejoin="round"
                />
                <circle cx="10" cy="9.35" r="2.15" fill="none" stroke="currentColor" stroke-width="1.35" />
              </svg>
            </button>
            ${
              session
                ? html`<span class="rail-avatar" aria-hidden="true"
                    >${initialsFor(session.name)}</span
                  >`
                : nothing
            }
          </span>
          <span class="rail-workplace">${store.org.label}</span>
        </div>

        <div class="rail-score">
          <div class="rail-score-row">
            <span class="rail-score-value">${formatPct(c.current)}</span>
            <span class="rail-chip score-${band}">${this.statusLabel(c, noQuota)}</span>
          </div>
          ${
            noQuota
              ? nothing
              : html`
                  <div class="rail-progress">
                    <span
                      class="rail-progress-fill score-${band}"
                      style="width:${Math.min(1, Math.max(0, c.current ?? 0)) * 100}%"
                    ></span>
                    <span class="rail-progress-target" style="left:${c.target * 100}%"></span>
                  </div>
                  <div class="rail-caption">
                    <span>${this.targetCopy(c, noQuota)}</span>
                    <strong>${formatPct(c.target)} target</strong>
                  </div>
                `
          }
        </div>

        ${this.forecast(c, band)} ${this.totals()}

        <div
          class="rail-footer ${
            this.needsReconnect || this.isSyncUnavailable ? '' : 'rail-footer--quiet'
          }"
        >
          ${
            this.needsReconnect
              ? html`<button
                  class="reconnect-pill"
                  @click=${() => this.onReconnect()}
                  ?disabled=${this.reconnecting}
                  title="Your changes aren't syncing to your cloud storage. Tap to reconnect."
                >
                  ${this.reconnectLabel}
                </button>`
              : this.isSyncUnavailable
                ? html`<span
                    class="offline-pill"
                    title="Badgy is using your local cache and will retry your cloud storage automatically."
                    >Offline</span
                  >`
                : nothing
          }
          <div class="rail-account">
            ${
              session
                ? html`<span class="rail-avatar" aria-hidden="true"
                    >${initialsFor(session.name)}</span
                  >`
                : nothing
            }
            ${
              session
                ? html`<span class="rail-account-name" title=${session.email}
                    >${session.name}</span
                  >`
                : nothing
            }
            <div class="rail-account-actions">
              <button
                class="badgy-button badgy-button--icon"
                @click=${() => this.onHelp()}
                aria-label="Help"
                title="Help"
              >
                ?
              </button>
              <button
                class="badgy-button badgy-button--icon"
                @click=${() => this.onSettings()}
                aria-label="Settings"
                title="Settings"
              >
                <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
                  <path
                    d="M8.3 2.2h3.4l.5 2a6.2 6.2 0 0 1 1.1.7l2-.6 1.7 3-1.5 1.4a6 6 0 0 1 0 1.3l1.5 1.4-1.7 3-2-.6a6.2 6.2 0 0 1-1.1.7l-.5 2H8.3l-.5-2a6.2 6.2 0 0 1-1.1-.7l-2 .6-1.7-3L4.5 10a6 6 0 0 1 0-1.3L3 7.3l1.7-3 2 .6a6.2 6.2 0 0 1 1.1-.7l.5-2Z"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.35"
                    stroke-linejoin="round"
                  />
                  <circle cx="10" cy="9.35" r="2.15" fill="none" stroke="currentColor" stroke-width="1.35" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </aside>
    `;
  }
}

customElements.define('score-rail', ScoreRail);
