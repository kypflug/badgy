import {
  addDays,
  type CalendarNote,
  meetupCycleLabel,
  type PickableStatus,
  type ResolvedDay,
  toISO,
} from '@badgy/shared';
import { html } from 'lit';
import { rangeEditMessage } from '../lib/format.js';
import { undoShortcutLabel } from '../lib/platform.js';
import { statusClass } from '../lib/status.js';
import { toast } from '../lib/toast.js';
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
  positionRangeToolbar,
  rangeDates,
  rangeToolbar,
  rangeToolbarAnchor,
  ViewportOverlayHost,
} from './calendar-overlays.js';
import {
  YEAR_MONTHS,
  yearDayLabel,
  yearDayState,
  yearMonthMetadata,
} from './year-planner-model.js';

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
  private toolbarPosition: DayMenuPosition = {
    left: 12,
    edge: 'top',
    offset: 12,
    maxHeight: 1,
  };
  private dragging = false;
  private moved = false;
  private lastFocused: HTMLElement | null = null;
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
    this.lastFocused = null;
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
    this.lastFocused = this.querySelector<HTMLElement>(`.year-day[data-date="${date}"]`);
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

  private readonly onUp = (): void => {
    this.dragging = false;
    document.removeEventListener('pointermove', this.onMove);
    document.removeEventListener('pointerup', this.onUp);
    if (this.moved) {
      this.toolbarPosition = positionRangeToolbar(this.toolbarAnchor());
      this.toolbar = true;
    } else if (this.selStart) {
      this.openMenu(this.selStart);
      this.selStart = null;
      this.selEnd = null;
    }
  };

  /** Bounding box of the selected cells, centered for the range toolbar's placement math. */
  private toolbarAnchor() {
    const rects = [...this.selectedSet()]
      .map((date) => this.querySelector<HTMLElement>(`.year-day[data-date="${date}"]`))
      .filter((cell): cell is HTMLElement => cell !== null)
      .map((cell) => cell.getBoundingClientRect());
    return rangeToolbarAnchor(rects) ?? { left: 12, top: 12, bottom: 12 };
  }

  private openMenu(date: string): void {
    const cell = this.querySelector<HTMLElement>(`.year-day[data-date="${date}"]`);
    if (!cell) return;
    this.lastFocused ??= cell;
    this.menuPosition = positionDayMenu(cell.getBoundingClientRect());
    this.menuDate = date;
  }

  private restoreFocus(): void {
    const element = this.lastFocused;
    this.lastFocused = null;
    if (element?.isConnected) element.focus();
  }

  private closeMenu(): void {
    this.menuDate = null;
    this.restoreFocus();
  }

  private pick(status: PickableStatus): void {
    if (this.menuDate) store.setStatus(this.menuDate, status);
    this.closeMenu();
  }

  private resetDay(): void {
    if (this.menuDate) store.clearDate(this.menuDate);
    this.closeMenu();
  }

  private closeToolbar(): void {
    this.clearSelection();
    this.restoreFocus();
  }

  private applyRange(status: PickableStatus): void {
    const dates = rangeDates(this.selStart, this.selEnd);
    if (dates.length > 0) {
      store.setRange(dates, status);
      if (dates.length > 1) toast(rangeEditMessage(dates.length, 'set', undoShortcutLabel()));
    }
    this.closeToolbar();
  }

  private resetRange(): void {
    const dates = rangeDates(this.selStart, this.selEnd);
    if (dates.length > 0) {
      store.clearRange(dates);
      if (dates.length > 1) toast(rangeEditMessage(dates.length, 'cleared', undoShortcutLabel()));
    }
    this.closeToolbar();
  }
  private openNoteEditor(start: string, end: string): void {
    this.lastFocused ??= this.querySelector<HTMLElement>(`.year-day[data-date="${start}"]`);
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
    this.lastFocused = document.activeElement as HTMLElement | null;
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
    this.restoreFocus();
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
        this.closeMenu();
      },
    });
  }

  private renderToolbar() {
    return rangeToolbar({
      position: this.toolbarPosition,
      count: this.selectedSet().size,
      onPick: (status) => this.applyRange(status),
      onReset: () => this.resetRange(),
      onNote: () => {
        if (this.selStart && this.selEnd) this.openNoteEditor(this.selStart, this.selEnd);
      },
      onDismiss: () => this.closeToolbar(),
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
    if (this.noteStart) this.overlay.show(this.renderNoteEditor(), 'note');
    else if (this.menuDate) this.overlay.show(this.renderMenu(), 'menu');
    else if (this.toolbar) this.overlay.show(this.renderToolbar(), 'toolbar');
    else this.overlay.clear();
  }

  private dayCell(day: ResolvedDay, selected: Set<string>) {
    const state = yearDayState(day);
    const classes = [
      'year-day',
      'year-dot-button',
      statusClass(day.status),
      day.isToday ? 'year-day--today' : '',
      `year-day--${state}`,
      day.isWeekend ? 'year-day--weekend' : '',
      this.menuDate === day.date ? 'year-day--active' : '',
      selected.has(day.date) ? 'year-day--selected' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const holidayName = day.isHoliday ? store.holidayName(day.date) : null;
    const label = yearDayLabel(day, holidayName);
    return html`
      <button
        type="button"
        class=${classes}
        data-date=${day.date}
        data-status=${day.status}
        data-state=${state}
        data-today=${day.isToday ? 'true' : 'false'}
        title=${label}
        aria-label=${label}
        aria-pressed=${selected.has(day.date) ? 'true' : 'false'}
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
            this.lastFocused = event.currentTarget as HTMLElement;
            this.openMenu(day.date);
          }
        }}
      >
        <span class="year-day-dot" aria-hidden="true"></span>
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
    const monthDays = cells.filter((day): day is ResolvedDay => day !== null);
    const month = YEAR_MONTHS[month0];

    return html`
      <section
        class="year-month"
        role="listitem"
        data-month=${String(month0 + 1)}
        aria-label=${`${month.long} ${this.year}`}
      >
        <header class="year-month-header">
          <h2 class="year-month-title" aria-label=${`${month.long} ${this.year}`}>
            <span aria-hidden="true">${month.short}</span>
          </h2>
          <span class="year-month-meta">${yearMonthMetadata(monthDays)}</span>
        </header>
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
                    : html`
                        <span
                          class="year-day-spacer year-dot-spacer"
                          data-spacer="true"
                          aria-hidden="true"
                        ></span>
                      `,
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
    const notes = store.notesInRange(`${this.year}-01-01`, `${this.year}-12-31`);

    return html`
      <section
        class="year-planner"
        data-layout="3x4"
        aria-label=${`${this.year} yearly planner`}
      >
        <div class="year-months" role="list">
          ${YEAR_MONTHS.map((_, month0) => this.monthCard(month0, daysByDate, selected, notes))}
        </div>
      </section>
    `;
  }
}

customElements.define('year-planner', YearPlanner);
