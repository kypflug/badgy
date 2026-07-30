import {
  type CalendarNote,
  meetupCycleLabel,
  type PickableStatus,
  type ResolvedDay,
  STATUS_LABEL,
  STATUS_SHORT,
} from '@badgy/shared';
import { html, nothing } from 'lit';
import { formatPct, rangeEditMessage } from '../lib/format.js';
import { undoShortcutLabel } from '../lib/platform.js';
import { scoreColumnPresentation } from '../lib/score-column.js';
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
  DEFAULT_NOTE_COLOR,
  dayMenu,
  noteEditor,
  type OverlayPosition,
  positionDayMenu,
  positionRangeToolbar,
  rangeDates,
  rangeToolbar,
  rangeToolbarAnchor,
  ViewportOverlayHost,
} from './calendar-overlays.js';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export class MonthCalendar extends BadgyElement {
  static override properties = {
    year: { type: Number },
    month0: { type: Number },
    menuDate: { state: true },
    selStart: { state: true },
    selEnd: { state: true },
    toolbar: { state: true },
    editingNote: { state: true },
  };
  year = 0;
  month0 = 0;
  menuDate: string | null = null;
  selStart: string | null = null;
  selEnd: string | null = null;
  toolbar = false;
  editingNote: CalendarNote | null = null;
  private noteStart = '';
  private noteEnd = '';
  private noteLabel = '';
  private noteColor = DEFAULT_NOTE_COLOR;
  private menuPosition: OverlayPosition = {
    left: 12,
    edge: 'top',
    offset: 12,
    maxHeight: 1,
  };
  private toolbarPosition: OverlayPosition = {
    left: 12,
    edge: 'top',
    offset: 12,
    maxHeight: 1,
  };
  private dragging = false;
  private moved = false;
  /** The element focused when a menu/toolbar opened, restored once it closes. */
  private lastFocused: HTMLElement | null = null;
  private readonly overlay = new ViewportOverlayHost();

  override disconnectedCallback(): void {
    this.cancelInteraction();
    super.disconnectedCallback();
  }

  get hasActiveInteraction(): boolean {
    return this.dragging || this.menuDate !== null || this.toolbar || this.noteStart !== '';
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
    this.clearSel();
    this.overlay.clear();
  }

  private selectedSet(): Set<string> {
    return new Set(rangeDates(this.selStart, this.selEnd));
  }
  private clearSel(): void {
    this.selStart = null;
    this.selEnd = null;
    this.toolbar = false;
  }

  /** Restore focus to whatever triggered the popup, if it's still in the document. */
  private restoreFocus(): void {
    const el = this.lastFocused;
    this.lastFocused = null;
    if (el?.isConnected) el.focus();
  }

  private readonly onDown = (e: PointerEvent, date: string): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    this.lastFocused = this.querySelector<HTMLElement>(`.month-day[data-date="${date}"]`);
    this.menuDate = null;
    this.toolbar = false;
    this.selStart = date;
    this.selEnd = date;
    this.dragging = true;
    this.moved = false;
    document.addEventListener('pointermove', this.onMove);
    document.addEventListener('pointerup', this.onUp, { once: true });
  };
  private readonly onMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest(
      '.month-day',
    );
    const date = (el as HTMLElement | null)?.dataset.date;
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
      .map((date) => this.querySelector<HTMLElement>(`.month-day[data-date="${date}"]`))
      .filter((cell): cell is HTMLElement => cell !== null)
      .map((cell) => cell.getBoundingClientRect());
    return rangeToolbarAnchor(rects) ?? { left: 12, top: 12, bottom: 12 };
  }

  private openMenu(date: string): void {
    const cell = this.querySelector<HTMLElement>(`.month-day[data-date="${date}"]`);
    if (!cell) return;
    this.lastFocused ??= document.activeElement as HTMLElement | null;
    this.menuPosition = positionDayMenu(cell.getBoundingClientRect());
    this.menuDate = date;
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
    this.clearSel();
    this.restoreFocus();
  }
  private applyRange(status: PickableStatus): void {
    const dates = [...this.selectedSet()];
    if (dates.length) {
      store.setRange(dates, status);
      if (dates.length > 1) toast(rangeEditMessage(dates.length, 'set', undoShortcutLabel()));
    }
    this.closeToolbar();
  }
  private resetRange(): void {
    const dates = [...this.selectedSet()];
    if (dates.length) {
      store.clearRange(dates);
      if (dates.length > 1) toast(rangeEditMessage(dates.length, 'cleared', undoShortcutLabel()));
    }
    this.closeToolbar();
  }
  private openNoteEditor(start: string, end: string): void {
    this.lastFocused ??= document.activeElement as HTMLElement | null;
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
    this.clearSel();
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
    this.clearSel();
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

  private dayCell(d: ResolvedDay, selected: Set<string>) {
    const inMonth = Number(d.date.slice(5, 7)) - 1 === this.month0;
    const holidayName = d.isHoliday ? store.holidayName(d.date) : null;
    const noteText = holidayName ?? (d.isToday ? 'Today' : null);
    const tracked = d.status !== 'none';
    const cls = [
      'month-day',
      statusClass(d.status),
      inMonth ? '' : 'month-day--outside',
      d.isToday ? 'month-day--today' : '',
      d.isFuture ? 'month-day--planned' : 'month-day--recorded',
      d.isWeekend ? 'month-day--weekend' : '',
      this.menuDate === d.date ? 'month-day--active' : '',
      selected.has(d.date) ? 'month-day--selected' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const label = `${d.date} · ${STATUS_LABEL[d.status]}${holidayName ? ` · ${holidayName}` : ''}`;
    return html`<button
      type="button"
      class=${cls}
      data-date=${d.date}
      title=${label}
      aria-label=${label}
      @pointerdown=${(e: PointerEvent) => this.onDown(e, d.date)}
      @pointerenter=${() => {
        if (this.dragging) {
          this.selEnd = d.date;
          if (d.date !== this.selStart) this.moved = true;
        }
      }}
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.lastFocused = e.currentTarget as HTMLElement;
          this.openMenu(d.date);
        }
      }}
    >
      <span class="month-day-head">
        <span class="month-day-date">${Number(d.date.slice(8, 10))}</span>
        ${noteText ? html`<span class="month-day-note">${noteText}</span>` : nothing}
      </span>
      <span class="month-day-status ${tracked ? statusClass(d.status) : 'month-day-status--empty'}">
        ${tracked ? STATUS_SHORT[d.status] : ''}
      </span>
      ${
        tracked
          ? html`<span
              class="month-day-bar ${statusClass(d.status)} ${
                d.isFuture ? 'month-day-bar--planned' : 'month-day-bar--recorded'
              }"
            ></span>`
          : nothing
      }
    </button>`;
  }

  private renderMenu() {
    return dayMenu({
      position: this.menuPosition,
      onPick: (status) => this.pick(status),
      onReset: () => this.resetDay(),
      onNote: () => {
        if (this.menuDate) this.openNoteEditor(this.menuDate, this.menuDate);
      },
      onDismiss: () => this.closeMenu(),
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

  override render() {
    const days = store.monthDays(this.year, this.month0);
    const weekStarts = store.monthWeekStarts(this.year, this.month0);
    const selected = this.selectedSet();
    const notes =
      days.length > 0 ? store.notesInRange(days[0].date, days[days.length - 1].date) : [];
    const weeks: ResolvedDay[][] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    const scoreTitle = `${store.org.label} — ${store.org.summary}`;
    const scoreColumn = scoreColumnPresentation(store.scheme);

    return html`
      <div class="month">
        <div class="month-row month-row--head">
          ${DOW.map(
            (l, i) =>
              html`<div class="month-dow ${i === 0 || i === 6 ? 'month-dow--weekend' : ''}">${l}</div>`,
          )}
          <div class="month-dow month-dow--score">${scoreColumn.label}</div>
        </div>
        ${weeks.map((week, wi) => {
          const weekStart = weekStarts[wi];
          const score = scoreColumn.showPercentage ? store.weekScore(weekStart) : null;
          const officeDays = store.weekOfficeDays(weekStart);
          const scoreClass = score == null ? '' : `score-${store.band(score)}`;
          const meetupLabel = store.isMeetupWeek(weekStart)
            ? (meetupCycleLabel(weekStart) ?? 'Meetup')
            : null;
          const annotations = notes.map(noteAnnotation);
          if (meetupLabel) annotations.push(meetupAnnotation(weekStart, meetupLabel));
          const segments = layoutWeekAnnotations(weekStart, annotations);
          return html`<div class="month-row">
            ${annotationOverlay(segments, (note) => this.editNote(note))}
            ${week.map((d) => this.dayCell(d, selected))}
            <div
              class="month-week-score ${scoreClass} ${
                scoreColumn.showPercentage ? '' : 'month-week-score--days-only'
              }"
              title=${scoreTitle}
            >
              ${
                scoreColumn.showPercentage
                  ? html`<span class="month-week-score-pct">${formatPct(score)}</span>`
                  : nothing
              }
              <span class="month-week-score-days"
                >${officeDays} office day${officeDays === 1 ? '' : 's'}</span
              >
            </div>
          </div>`;
        })}
      </div>
    `;
  }
}

customElements.define('month-calendar', MonthCalendar);
