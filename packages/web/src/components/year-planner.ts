import {
  addDays,
  countStatuses,
  meetupCycleLabel,
  type PickableStatus,
  type ResolvedDay,
  STATUS_LABEL,
  toISO,
} from '@rto/shared';
import { html, nothing } from 'lit';
import { STATUS_ICON, STATUS_ORDER, statusClass } from '../lib/status.js';
import { store } from '../state/store.js';
import { RtoElement } from './base.js';
import { dayMenu, rangeDates, rangeToolbar } from './calendar-overlays.js';

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
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export class YearPlanner extends RtoElement {
  static override properties = {
    year: { type: Number },
    menuDate: { state: true },
    selStart: { state: true },
    selEnd: { state: true },
    toolbar: { state: true },
  };

  year = 0;
  menuDate: string | null = null;
  selStart: string | null = null;
  selEnd: string | null = null;
  toolbar = false;

  private menuX = 0;
  private menuY = 0;
  private toolbarX = 0;
  private toolbarY = 0;
  private dragging = false;
  private moved = false;

  override disconnectedCallback(): void {
    this.cancelInteraction();
    super.disconnectedCallback();
  }

  cancelInteraction(): void {
    this.dragging = false;
    this.moved = false;
    document.removeEventListener('pointermove', this.onMove);
    document.removeEventListener('pointerup', this.onUp);
    this.menuDate = null;
    this.clearSelection();
  }

  private selectedSet(): Set<string> {
    return new Set(rangeDates(this.selStart, this.selEnd));
  }

  private clearSelection(): void {
    this.selStart = null;
    this.selEnd = null;
    this.toolbar = false;
  }

  private readonly onDown = (event: PointerEvent, date: string): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    this.menuDate = null;
    this.toolbar = false;
    this.selStart = date;
    this.selEnd = date;
    this.dragging = true;
    this.moved = false;
    document.addEventListener('pointermove', this.onMove);
    document.addEventListener('pointerup', this.onUp, { once: true });
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (!this.dragging) return;
    const cell = (
      document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
    )?.closest<HTMLElement>('.year-day');
    const date = cell?.dataset.date;
    if (date && date !== this.selEnd) {
      this.selEnd = date;
      if (date !== this.selStart) this.moved = true;
    }
  };

  private readonly onUp = (event: PointerEvent): void => {
    this.dragging = false;
    document.removeEventListener('pointermove', this.onMove);
    document.removeEventListener('pointerup', this.onUp);
    if (this.moved) {
      this.toolbarX = Math.min(
        Math.max(event.clientX - 180, 12),
        Math.max(12, window.innerWidth - 372),
      );
      this.toolbarY = Math.min(event.clientY + 12, Math.max(12, window.innerHeight - 96));
      this.toolbar = true;
    } else if (this.selStart) {
      this.openMenu(this.selStart);
      this.selStart = null;
      this.selEnd = null;
    }
  };

  private openMenu(date: string): void {
    const cell = this.querySelector<HTMLElement>(`.year-day[data-date="${date}"]`);
    if (!cell) return;
    const rect = cell.getBoundingClientRect();
    this.menuX = Math.min(Math.max(rect.left, 12), Math.max(12, window.innerWidth - 224));
    this.menuY = Math.min(rect.bottom + 4, Math.max(12, window.innerHeight - 344));
    this.menuDate = date;
  }

  private pick(status: PickableStatus): void {
    if (this.menuDate) store.setStatus(this.menuDate, status);
    this.menuDate = null;
  }

  private resetDay(): void {
    if (this.menuDate) store.clearDate(this.menuDate);
    this.menuDate = null;
  }

  private applyRange(status: PickableStatus): void {
    const dates = rangeDates(this.selStart, this.selEnd);
    if (dates.length > 0) store.setRange(dates, status);
    this.clearSelection();
  }

  private resetRange(): void {
    const dates = rangeDates(this.selStart, this.selEnd);
    if (dates.length > 0) store.clearRange(dates);
    this.clearSelection();
  }

  private dayCell(day: ResolvedDay, selected: Set<string>) {
    const classes = [
      'year-day',
      statusClass(day.status),
      day.isToday ? 'year-day--today' : '',
      day.isFuture ? 'year-day--future' : 'year-day--past',
      day.isWeekend ? 'year-day--weekend' : '',
      this.menuDate === day.date ? 'year-day--active' : '',
      selected.has(day.date) ? 'year-day--selected' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const label = `${day.date} · ${STATUS_LABEL[day.status]}`;
    return html`
      <button
        type="button"
        class=${classes}
        data-date=${day.date}
        title=${label}
        aria-label=${label}
        @pointerdown=${(event: PointerEvent) => this.onDown(event, day.date)}
        @pointerenter=${() => {
          if (this.dragging) {
            this.selEnd = day.date;
            if (day.date !== this.selStart) this.moved = true;
          }
        }}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.openMenu(day.date);
          }
        }}
      >
        <span class="year-day-num">${Number(day.date.slice(8, 10))}</span>
      </button>
    `;
  }

  private monthCard(
    month0: number,
    daysByDate: ReadonlyMap<string, ResolvedDay>,
    selected: Set<string>,
  ) {
    const leading = new Date(Date.UTC(this.year, month0, 1)).getUTCDay();
    const dayCount = new Date(Date.UTC(this.year, month0 + 1, 0)).getUTCDate();
    const firstDate = toISO(new Date(Date.UTC(this.year, month0, 1)));
    const firstWeekStart = addDays(firstDate, -leading);
    const cells: (ResolvedDay | null)[] = Array.from({ length: leading }, () => null);
    for (let day = 1; day <= dayCount; day++) {
      const date = toISO(new Date(Date.UTC(this.year, month0, day)));
      cells.push(daysByDate.get(date) ?? null);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (ResolvedDay | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    return html`
      <section class="year-month mai-card" aria-label=${`${MONTHS[month0]} ${this.year}`}>
        <h2 class="year-month-title">${MONTHS[month0]}</h2>
        <div class="year-month-grid year-month-head" aria-hidden="true">
          ${DOW.map((label) => html`<span class="year-dow">${label}</span>`)}
        </div>
        <div class="year-month-weeks">
          ${weeks.map((week, weekIndex) => {
            const weekStart = addDays(firstWeekStart, weekIndex * 7);
            const isMeetup = store.isMeetupWeek(weekStart);
            const meetupLabel = isMeetup ? (meetupCycleLabel(weekStart) ?? 'Meetup') : null;
            return html`
              <div
                class="year-week ${isMeetup ? 'year-week--meetup' : ''}"
                role=${isMeetup ? 'group' : nothing}
                aria-label=${isMeetup ? `${meetupLabel} meetup week` : nothing}
              >
                ${
                  meetupLabel
                    ? html`<span class="year-meetup-label" aria-hidden="true">${meetupLabel}</span>`
                    : nothing
                }
                ${week.map((day) =>
                  day
                    ? this.dayCell(day, selected)
                    : html`<span class="year-day-spacer" aria-hidden="true"></span>`,
                )}
              </div>
            `;
          })}
        </div>
      </section>
    `;
  }

  override render() {
    const days = store.yearDays(this.year);
    const daysByDate = new Map(days.map((day) => [day.date, day]));
    const selected = this.selectedSet();
    const counts = countStatuses(days);

    return html`
      <section class="year-planner" aria-label=${`${this.year} yearly planner`}>
        <div class="year-months">
          ${MONTHS.map((_, month0) => this.monthCard(month0, daysByDate, selected))}
        </div>
        <aside class="year-summary mai-card" aria-label=${`${this.year} status totals`}>
          <div class="year-summary-head">
            <span class="year-summary-eyebrow">Year totals</span>
            <strong>${this.year}</strong>
          </div>
          <div class="year-summary-list">
            ${STATUS_ORDER.map(
              (status) => html`
                <div class="year-summary-row">
                  <span class="year-summary-status">
                    <span class="year-summary-icon ${statusClass(status)}" aria-hidden="true">
                      ${STATUS_ICON[status]}
                    </span>
                    <span>${STATUS_LABEL[status]}</span>
                  </span>
                  <strong class="year-summary-count">${counts[status]}</strong>
                </div>
              `,
            )}
          </div>
        </aside>
      </section>
      ${
        this.menuDate
          ? dayMenu({
              x: this.menuX,
              y: this.menuY,
              onPick: (status) => this.pick(status),
              onReset: () => this.resetDay(),
              onDismiss: () => {
                this.menuDate = null;
              },
            })
          : nothing
      }
      ${
        this.toolbar
          ? rangeToolbar({
              x: this.toolbarX,
              y: this.toolbarY,
              count: selected.size,
              onPick: (status) => this.applyRange(status),
              onReset: () => this.resetRange(),
              onDismiss: () => this.clearSelection(),
            })
          : nothing
      }
    `;
  }
}

customElements.define('year-planner', YearPlanner);
