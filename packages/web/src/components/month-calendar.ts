import {
  beltBand,
  type CalendarNote,
  meetupCycleLabel,
  type PickableStatus,
  type ResolvedDay,
  STATUS_LABEL,
  STATUS_SHORT,
} from '@rto/shared';
import { html, nothing } from 'lit';
import { formatPct } from '../lib/format.js';
import { STATUS_ICON, statusClass } from '../lib/status.js';
import { store } from '../state/store.js';
import {
  annotationOverlay,
  layoutWeekAnnotations,
  meetupAnnotation,
  noteAnnotation,
} from './annotation-layout.js';
import { RtoElement } from './base.js';
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

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export class MonthCalendar extends RtoElement {
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
  private menuPosition: DayMenuPosition = {
    left: 12,
    edge: 'top',
    offset: 12,
    maxHeight: 1,
  };
  private tbX = 0;
  private tbY = 0;
  private dragging = false;
  private moved = false;
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

  private readonly onDown = (e: PointerEvent, date: string): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
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
      '.day',
    );
    const date = (el as HTMLElement | null)?.dataset.date;
    if (date && date !== this.selEnd) {
      this.selEnd = date;
      if (date !== this.selStart) this.moved = true;
    }
  };
  private readonly onUp = (e: PointerEvent): void => {
    this.dragging = false;
    document.removeEventListener('pointermove', this.onMove);
    document.removeEventListener('pointerup', this.onUp);
    if (this.moved) {
      this.tbX = Math.min(Math.max(e.clientX - 180, 12), Math.max(12, window.innerWidth - 372));
      this.tbY = Math.min(e.clientY + 12, Math.max(12, window.innerHeight - 96));
      this.toolbar = true;
    } else if (this.selStart) {
      this.openMenu(this.selStart);
      this.selStart = null;
      this.selEnd = null;
    }
  };

  private openMenu(date: string): void {
    const cell = this.querySelector<HTMLElement>(`.day[data-date="${date}"]`);
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
    const dates = [...this.selectedSet()];
    if (dates.length) store.setRange(dates, status);
    this.clearSel();
  }
  private resetRange(): void {
    const dates = [...this.selectedSet()];
    if (dates.length) store.clearRange(dates);
    this.clearSel();
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
    const cls = [
      'day',
      statusClass(d.status),
      inMonth ? '' : 'day--outside',
      d.isToday ? 'day--today' : '',
      d.isFuture ? 'day--future' : 'day--past',
      d.isWeekend ? 'day--weekend' : '',
      this.menuDate === d.date ? 'day--active' : '',
      selected.has(d.date) ? 'day--selected' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return html`<button
      class=${cls}
      data-date=${d.date}
      title=${`${d.date} · ${STATUS_LABEL[d.status]}`}
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
          this.openMenu(d.date);
        }
      }}
    >
      <span class="day-head">
        <span class="day-num">${Number(d.date.slice(8, 10))}</span>
        ${
          d.status !== 'none'
            ? html`<span class="day-emoji" aria-hidden="true">${STATUS_ICON[d.status]}</span>`
            : nothing
        }
      </span>
      ${d.status !== 'none' ? html`<span class="day-tag">${STATUS_SHORT[d.status]}</span>` : nothing}
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
      onDismiss: () => {
        this.menuDate = null;
      },
    });
  }

  private renderToolbar() {
    return rangeToolbar({
      x: this.tbX,
      y: this.tbY,
      count: this.selectedSet().size,
      onPick: (status) => this.applyRange(status),
      onReset: () => this.resetRange(),
      onNote: () => {
        if (this.selStart && this.selEnd) this.openNoteEditor(this.selStart, this.selEnd);
      },
      onDismiss: () => this.clearSel(),
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

  override render() {
    const days = store.monthDays(this.year, this.month0);
    const weekStarts = store.monthWeekStarts(this.year, this.month0);
    const selected = this.selectedSet();
    const notes =
      days.length > 0 ? store.notesInRange(days[0].date, days[days.length - 1].date) : [];
    const weeks: ResolvedDay[][] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

    return html`
      <div class="cal">
        <div class="cal-grid cal-head">
          ${DOW.map((l) => html`<div class="cal-dow">${l}</div>`)}
          <div class="cal-dow cal-dow--belt">BELT</div>
        </div>
        ${weeks.map((week, wi) => {
          const weekStart = weekStarts[wi];
          const belt = store.weekBelt(weekStart);
          const beltCls = belt == null ? '' : `belt-${beltBand(belt)}`;
          const meetupLabel = store.isMeetupWeek(weekStart)
            ? (meetupCycleLabel(weekStart) ?? 'Meetup')
            : null;
          const annotations = notes.map(noteAnnotation);
          if (meetupLabel) annotations.push(meetupAnnotation(weekStart, meetupLabel));
          const segments = layoutWeekAnnotations(weekStart, annotations);
          return html`<div class="cal-grid cal-row">
            ${annotationOverlay(segments, (note) => this.editNote(note))}
            ${week.map((d) => this.dayCell(d, selected))}
            <div class="cal-belt ${beltCls}" title="Best-8-of-12 BELT for this week">${formatPct(belt)}</div>
          </div>`;
        })}
      </div>
    `;
  }
}

customElements.define('month-calendar', MonthCalendar);
