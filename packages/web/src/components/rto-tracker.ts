import { beltBand, type DayKey, STATUSES, type Status } from '@rto/shared';
import { html, nothing } from 'lit';
import { currentWeekStart } from '../lib/dates.js';
import { formatPct, formatWeekLabel } from '../lib/format.js';
import { store } from '../state/store.js';
import { RtoElement } from './base.js';

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
];

export class RtoTracker extends RtoElement {
  private readonly onDay = (weekStart: string, day: DayKey) => (e: Event) => {
    store.setStatus(weekStart, day, (e.target as HTMLSelectElement).value as Status);
  };

  private dayCell(weekStart: string, day: DayKey, status: Status) {
    return html`<td class="day day--${status.toLowerCase()}">
      <select
        class="day-select"
        aria-label=${`${day} status, week of ${formatWeekLabel(weekStart)}`}
        @change=${this.onDay(weekStart, day)}
      >
        ${STATUSES.map((s) => html`<option value=${s} ?selected=${s === status}>${s}</option>`)}
      </select>
    </td>`;
  }

  override render() {
    const year = store.year();
    const computed = store.computed();
    const totals = store.totals();
    const today = currentWeekStart(year.weeks.map((w) => w.weekStart));

    return html`
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2 class="panel-title">${year.year} attendance</h2>
            <p class="panel-sub">
              Set a status for each weekday. Office and Planned days both count toward your score;
              <span class="legend-dot legend-meetup"></span> MAI Meetup weeks are highlighted.
            </p>
          </div>
        </div>

        <div class="mai-card table-card">
          <div class="table-scroll">
            <table class="tracker">
              <thead>
                <tr>
                  <th class="col-week">Week</th>
                  ${DAYS.map((d) => html`<th>${d.label}</th>`)}
                  <th class="num">DTO</th>
                  <th class="num">Office</th>
                  <th class="num">BELT</th>
                </tr>
              </thead>
              <tbody>
                ${year.weeks.map((w, i) => {
                  const c = computed[i];
                  const band = c.belt == null ? '' : `belt-${beltBand(c.belt)}`;
                  const rowClass = [
                    w.meetup ? 'row--meetup' : '',
                    w.weekStart === today ? 'row--current' : '',
                  ]
                    .join(' ')
                    .trim();
                  return html`<tr class=${rowClass || nothing}>
                    <th scope="row" class="col-week">
                      <span class="week-label">${formatWeekLabel(w.weekStart)}</span>
                      ${w.meetup ? html`<span class="badge badge--meetup">Meetup</span>` : nothing}
                    </th>
                    ${DAYS.map((d) => this.dayCell(w.weekStart, d.key, w.days[d.key]))}
                    <td class="num">${c.dtoDays || ''}</td>
                    <td class="num office">${c.officeDays}</td>
                    <td class="num belt ${band}">${formatPct(c.belt)}</td>
                  </tr>`;
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" class="col-week">Total</th>
                  <td class="spacer" colspan="5"></td>
                  <td class="num">${totals.dtoDays || ''}</td>
                  <td class="num office">${totals.officeDays}</td>
                  <td class="num"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>
    `;
  }
}

customElements.define('rto-tracker', RtoTracker);
