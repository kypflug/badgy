import {
  addDays,
  type CalendarNote,
  countStatuses,
  meetupCycleLabel,
  type PickableStatus,
  type ResolvedDay,
  STATUS_LABEL,
  toISO,
} from '@badgy/shared';
import { html } from 'lit';
import { STATUS_ICON, STATUS_ORDER, statusClass } from '../lib/status.js';
import { store } from '../state/store.js';
import {
  annotationOverlay,
  layoutWeekAnnotations,
  meetupAnnotation,
  noteAnnotation,
} from './annotation-layout.js';
import { BadgyElement } from './base.js';
import {
  type DayMenuPosition,
  DEFAULT_NOTE_COLOR,
  dayMenu,
  noteEditor,
  positionDayMenu,
  rangeDates,
  rangeToolbar,
  ViewportOverlayHost,
} from './calendar-overlays.js';

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

export class YearPlanner extends BadgyElement {
  static override properties = {
    year: { type: Number },
    menuDate: { state: true },
    selStart: { state: true },
    selEnd: { state: true },
    toolbar: { state: true },
    editingNote: { state: true },
  };

  year = 0;
  menuDate: string | null = null;
  selStart: string | null = null;
  selEnd: string | null = null;
  toolbar = false;
  editingNote: CalendarNote | null = null;
  private noteStart = '';
  private noteEnd = '';
  private noteLabel = '';
  private noteColor = DEFAULT_NOTE_COLOR;

  private menuPosition: DayMenuPosition = {
    left: 12,
    edge: 'top',
    offset: 12,
    maxHeight: 1,
  };
  private toolbarX = 0;
  private toolbarY = 0;
  private dragging = false;
  private moved = false;
  private readonly overlay = new ViewportOverlayHost();

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
    this.editingNote = null;
    this.noteStart = '';
    this.noteEnd = '';
    this.clearSelection();
    this.overlay.clear();
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
    this.menuPosition = positionDayMenu(cell.getBoundingClientRect());
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
  private openNoteEditor(start: string, end: string): void {
    [this.noteStart, this.noteEnd] = start <= end ? [start, end] : [end, start];
    this.selStart = this.noteStart;
    this.selEnd = this.noteEnd;
    this.noteLabel = '';
    this.noteColor = DEFAULT_NOTE_COLOR;
    this.editingNote = null;
    this.menuDate = null;
    this.toolbar = false;
    this.requestUpdate();
  }

  private editNote(note: CalendarNote): void {
    this.clearSelection();
    this.menuDate = null;
    this.editingNote = note;
    this.noteStart = note.start;
    this.noteEnd = note.end;
    this.noteLabel = note.label;
    this.noteColor = note.color;
    this.requestUpdate();
  }

  private closeNoteEditor(): void {
    this.editingNote = null;
    this.noteStart = '';
    this.noteEnd = '';
    this.clearSelection();
    this.requestUpdate();
  }

  private saveNote(): void {
    if (this.editingNote)
      store.updateNote({
        ...this.editingNote,
        label: this.noteLabel,
        color: this.noteColor,
      });
    else store.createNote(this.noteStart, this.noteEnd, this.noteLabel, this.noteColor);
    this.closeNoteEditor();
  }

  private deleteNote(): void {
    if (this.editingNote) store.deleteNote(this.editingNote.id);
    this.closeNoteEditor();
  }

  private renderMenu() {
    return dayMenu({
      position: this.menuPosition,
      onPick: (status) => this.pick(status),
      onReset: () => this.resetDay(),
      onNote: () => {
        if (this.menuDate) this.openNoteEditor(this.menuDate, this.menuDate);
      },
      onDismiss: () => {
        this.menuDate = null;
      },
    });
  }

  private renderToolbar() {
    return rangeToolbar({
      x: this.toolbarX,
      y: this.toolbarY,
      count: this.selectedSet().size,
      onPick: (status) => this.applyRange(status),
      onReset: () => this.resetRange(),
      onNote: () => {
        if (this.selStart && this.selEnd) this.openNoteEditor(this.selStart, this.selEnd);
      },
      onDismiss: () => this.clearSelection(),
    });
  }

  private renderNoteEditor() {
    return noteEditor({
      start: this.noteStart,
      end: this.noteEnd,
      label: this.noteLabel,
      color: this.noteColor,
      editing: this.editingNote !== null,
      onLabel: (label) => {
        this.noteLabel = label;
      },
      onColor: (color) => {
        this.noteColor = color;
        this.requestUpdate();
      },
      onSave: () => this.saveNote(),
      onDelete: () => this.deleteNote(),
      onDismiss: () => this.closeNoteEditor(),
    });
  }

  protected override updated(): void {
    if (this.noteStart) this.overlay.show(this.renderNoteEditor());
    else if (this.menuDate) this.overlay.show(this.renderMenu());
    else if (this.toolbar) this.overlay.show(this.renderToolbar());
    else this.overlay.clear();
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
    const holidayName = day.isHoliday ? store.holidayName(day.date) : null;
    const label = `${day.date} · ${STATUS_LABEL[day.status]}${holidayName ? ` · ${holidayName}` : ''}`;
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
    notes: readonly CalendarNote[],
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
      <section class="year-month badgy-card" aria-label=${`${MONTHS[month0]} ${this.year}`}>
        <h2 class="year-month-title">${MONTHS[month0]}</h2>
        <div class="year-month-grid year-month-head" aria-hidden="true">
          ${DOW.map((label) => html`<span class="year-dow">${label}</span>`)}
        </div>
        <div class="year-month-weeks">
          ${weeks.map((week, weekIndex) => {
            const weekStart = addDays(firstWeekStart, weekIndex * 7);
            const meetupLabel = store.isMeetupWeek(weekStart)
              ? (meetupCycleLabel(weekStart) ?? 'Meetup')
              : null;
            const annotations = notes.map(noteAnnotation);
            if (meetupLabel) annotations.push(meetupAnnotation(weekStart, meetupLabel));
            const monthStart = `${this.year}-${String(month0 + 1).padStart(2, '0')}-01`;
            const monthEnd = toISO(new Date(Date.UTC(this.year, month0 + 1, 0)));
            const segments = layoutWeekAnnotations(weekStart, annotations, monthStart, monthEnd);
            return html`
              <div class="year-week">
                ${annotationOverlay(segments, (note) => this.editNote(note))}
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
    const notes = store.notesInRange(`${this.year}-01-01`, `${this.year}-12-31`);

    return html`
      <section class="year-planner" aria-label=${`${this.year} yearly planner`}>
        <div class="year-months">
          ${MONTHS.map((_, month0) => this.monthCard(month0, daysByDate, selected, notes))}
        </div>
        <aside class="year-summary badgy-card" aria-label=${`${this.year} status totals`}>
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
    `;
  }
}

customElements.define('year-planner', YearPlanner);
