import { beltBand, type ResolvedDay, STATUS_LABEL, STATUS_SHORT, type Status } from '@rto/shared';
import { html, nothing } from 'lit';
import { formatPct } from '../lib/format.js';
import { STATUS_ICON, STATUS_ORDER, statusClass } from '../lib/status.js';
import { store } from '../state/store.js';
import { RtoElement } from './base.js';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export class MonthCalendar extends RtoElement {
  static override properties = {
    year: { type: Number },
    month0: { type: Number },
    menuDate: { state: true },
  };
  year = 0;
  month0 = 0;
  menuDate: string | null = null;
  private menuX = 0;
  private menuY = 0;

  private openMenu(e: MouseEvent, date: string): void {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.menuX = Math.min(r.left, window.innerWidth - 220);
    this.menuY = Math.min(r.bottom + 4, window.innerHeight - 320);
    this.menuDate = date;
  }
  private pick(status: Status): void {
    if (this.menuDate) store.setStatus(this.menuDate, status);
    this.menuDate = null;
  }
  private resetDay(): void {
    if (this.menuDate) store.clearDate(this.menuDate);
    this.menuDate = null;
  }

  private dayCell(d: ResolvedDay) {
    const inMonth = Number(d.date.slice(5, 7)) - 1 === this.month0;
    const dayNum = Number(d.date.slice(8, 10));
    const cls = [
      'day',
      statusClass(d.status),
      inMonth ? '' : 'day--outside',
      d.isToday ? 'day--today' : '',
      d.isFuture ? 'day--future' : 'day--past',
      d.isWeekend ? 'day--weekend' : '',
      d.explicit ? 'day--explicit' : '',
      this.menuDate === d.date ? 'day--active' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return html`<button
      class=${cls}
      @click=${(e: MouseEvent) => this.openMenu(e, d.date)}
      title=${`${d.date} · ${STATUS_LABEL[d.status]}`}
    >
      <span class="day-num">${dayNum}</span>
      ${
        d.status !== 'none' ? html`<span class="day-tag">${STATUS_SHORT[d.status]}</span>` : nothing
      }
    </button>`;
  }

  private renderMenu() {
    return html`<div class="menu-backdrop" @click=${() => (this.menuDate = null)}></div>
      <div class="day-menu mai-card" style="left:${this.menuX}px;top:${this.menuY}px">
        ${STATUS_ORDER.map(
          (s) => html`<button class="day-menu-item" @click=${() => this.pick(s)}>
            <span class="dmi-dot ${statusClass(s)}">${STATUS_ICON[s]}</span>${STATUS_LABEL[s]}
          </button>`,
        )}
        <button class="day-menu-item day-menu-reset" @click=${() => this.resetDay()}>
          ↺ Reset to default
        </button>
      </div>`;
  }

  override render() {
    const days = store.monthDays(this.year, this.month0);
    const mondays = store.monthMondays(this.year, this.month0);
    const weeks: ResolvedDay[][] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

    return html`
      <div class="cal">
        <div class="cal-grid cal-head">
          ${DOW.map((l) => html`<div class="cal-dow">${l}</div>`)}
          <div class="cal-dow cal-dow--belt">BELT</div>
        </div>
        ${weeks.map((week, wi) => {
          const mon = mondays[wi];
          const belt = store.weekBelt(mon);
          const beltCls = belt == null ? '' : `belt-${beltBand(belt)}`;
          return html`<div class="cal-grid cal-row ${store.isMeetupWeek(mon) ? 'cal-row--meetup' : ''}">
            ${week.map((d) => this.dayCell(d))}
            <div class="cal-belt ${beltCls}" title="Best-8-of-12 BELT for this week">
              ${formatPct(belt)}
            </div>
          </div>`;
        })}
      </div>
      ${this.menuDate ? this.renderMenu() : nothing}
    `;
  }
}

customElements.define('month-calendar', MonthCalendar);
