import { addDays, type PickableStatus, STATUS_LABEL } from '@rto/shared';
import { html, nothing, render, type TemplateResult } from 'lit';
import { STATUS_ICON, STATUS_ORDER, statusClass } from '../lib/status.js';

const VIEWPORT_MARGIN = 12;
const POPUP_GAP = 4;
const DAY_MENU_WIDTH = 210;

export const NOTE_COLOR_PALETTE = [
  { label: 'Purple', value: '#7c3aed' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Teal', value: '#0891b2' },
  { label: 'Green', value: '#059669' },
  { label: 'Orange', value: '#d97706' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Pink', value: '#db2777' },
] as const;

export const DEFAULT_NOTE_COLOR: string = NOTE_COLOR_PALETTE[0].value;

interface AnchorRect {
  left: number;
  top: number;
  bottom: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

export interface DayMenuPosition {
  left: number;
  edge: 'top' | 'bottom';
  offset: number;
  maxHeight: number;
}

export function positionDayMenu(
  anchor: AnchorRect,
  viewport: ViewportSize = { width: window.innerWidth, height: window.innerHeight },
): DayMenuPosition {
  const menuWidth = Math.min(DAY_MENU_WIDTH, Math.max(0, viewport.width - VIEWPORT_MARGIN * 2));
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewport.width - VIEWPORT_MARGIN - menuWidth);
  const left = Math.min(Math.max(anchor.left, VIEWPORT_MARGIN), maxLeft);
  const spaceBelow = Math.max(0, viewport.height - VIEWPORT_MARGIN - anchor.bottom - POPUP_GAP);
  const spaceAbove = Math.max(0, anchor.top - POPUP_GAP - VIEWPORT_MARGIN);
  const edge = spaceBelow >= spaceAbove ? 'top' : 'bottom';

  return {
    left,
    edge,
    offset:
      edge === 'top'
        ? Math.max(VIEWPORT_MARGIN, anchor.bottom + POPUP_GAP)
        : Math.max(VIEWPORT_MARGIN, viewport.height - anchor.top + POPUP_GAP),
    maxHeight: Math.max(1, edge === 'top' ? spaceBelow : spaceAbove),
  };
}

export class ViewportOverlayHost {
  private host: HTMLDivElement | null = null;

  show(content: TemplateResult): void {
    if (!this.host) {
      this.host = document.createElement('div');
      this.host.className = 'calendar-overlay-host';
      document.body.append(this.host);
    }
    render(content, this.host);
  }

  clear(): void {
    if (!this.host) return;
    render(nothing, this.host);
    this.host.remove();
    this.host = null;
  }
}

export function rangeDates(start: string | null, end: string | null): string[] {
  if (!start || !end) return [];
  const [first, last] = start <= end ? [start, end] : [end, start];
  const dates: string[] = [];
  for (let date = first; date <= last; date = addDays(date, 1)) dates.push(date);
  return dates;
}

interface DayMenuOptions {
  position: DayMenuPosition;
  onPick: (status: PickableStatus) => void;
  onReset: () => void;
  onNote: () => void;
  onDismiss: () => void;
}

export function dayMenu(options: DayMenuOptions): TemplateResult {
  const verticalPosition =
    options.position.edge === 'top'
      ? `top:${options.position.offset}px;`
      : `bottom:${options.position.offset}px;`;
  return html`
    <div class="menu-backdrop" @pointerdown=${options.onDismiss}></div>
    <div
      class="day-menu mai-card"
      style=${`left:${options.position.left}px;${verticalPosition}max-height:${options.position.maxHeight}px`}
    >
      ${STATUS_ORDER.map(
        (status) => html`
          <button class="day-menu-item" @click=${() => options.onPick(status)}>
            <span class="dmi-dot ${statusClass(status)}">${STATUS_ICON[status]}</span>
            ${STATUS_LABEL[status]}
          </button>
        `,
      )}
      <button class="day-menu-item day-menu-note" @click=${options.onNote}>
        <span class="dmi-dot dmi-note" aria-hidden="true">✎</span>
        Add note
      </button>
      <button class="day-menu-item day-menu-reset" @click=${options.onReset}>
        ↺ Reset to default
      </button>
    </div>
  `;
}

interface RangeToolbarOptions {
  x: number;
  y: number;
  count: number;
  onPick: (status: PickableStatus) => void;
  onReset: () => void;
  onNote: () => void;
  onDismiss: () => void;
}

export function rangeToolbar(options: RangeToolbarOptions): TemplateResult {
  return html`
    <div class="menu-backdrop" @pointerdown=${options.onDismiss}></div>
    <div class="range-toolbar mai-card" style="left:${options.x}px;top:${options.y}px">
      <span class="rt-count">${options.count} day${options.count === 1 ? '' : 's'}</span>
      <div class="rt-statuses">
        ${STATUS_ORDER.map(
          (status) => html`
            <button
              class="rt-chip ${statusClass(status)}"
              title=${STATUS_LABEL[status]}
              @pointerdown=${(event: Event) => {
                event.preventDefault();
                options.onPick(status);
              }}
            >
              ${STATUS_ICON[status]}
            </button>
          `,
        )}
      </div>
      <button
        class="rt-note"
        title="Add note"
        aria-label="Add note to selected range"
        @pointerdown=${(event: Event) => {
          event.preventDefault();
          options.onNote();
        }}
      >
        ✎
      </button>
      <button
        class="rt-reset"
        title="Reset to default"
        @pointerdown=${(event: Event) => {
          event.preventDefault();
          options.onReset();
        }}
      >
        ↺
      </button>
    </div>
  `;
}

interface NoteEditorOptions {
  start: string;
  end: string;
  label: string;
  color: string;
  editing: boolean;
  onLabel: (label: string) => void;
  onColor: (color: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onDismiss: () => void;
}

export function noteEditor(options: NoteEditorOptions): TemplateResult {
  const range = options.start === options.end ? options.start : `${options.start} – ${options.end}`;
  return html`
    <div class="dialog-backdrop note-editor-backdrop" @pointerdown=${options.onDismiss}></div>
    <form
      class="dialog note-editor mai-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="note-editor-title"
      @keydown=${(event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          options.onDismiss();
        }
      }}
      @submit=${(event: SubmitEvent) => {
        event.preventDefault();
        const input = (event.currentTarget as HTMLFormElement).elements.namedItem(
          'note-label',
        ) as HTMLInputElement;
        if (!input.value.trim()) {
          input.setCustomValidity('Enter a note label.');
          input.reportValidity();
          return;
        }
        input.setCustomValidity('');
        options.onSave();
      }}
    >
      <header class="dialog-head">
        <div>
          <h2 class="dialog-title" id="note-editor-title">
            ${options.editing ? 'Edit note' : 'Add note'}
          </h2>
          <p class="note-editor-range">${range}</p>
        </div>
        <button
          type="button"
          class="mai-button mai-button--icon"
          @click=${options.onDismiss}
          aria-label="Close"
        >
          ✕
        </button>
      </header>
      <label class="note-editor-field">
        <span>Label</span>
        <input
          class="input"
          name="note-label"
          type="text"
          .value=${options.label}
          required
          autofocus
          @input=${(event: Event) => {
            const input = event.currentTarget as HTMLInputElement;
            input.setCustomValidity('');
            options.onLabel(input.value);
          }}
        />
      </label>
      <fieldset class="note-editor-field note-editor-color">
        <legend>Accent color</legend>
        <div class="note-color-options">
          ${NOTE_COLOR_PALETTE.map(
            ({ label, value }) => html`
              <button
                type="button"
                class="note-color-swatch"
                style=${`--note-color:${value}`}
                aria-label=${label}
                aria-pressed=${options.color.toLowerCase() === value}
                title=${label}
                @click=${() => options.onColor(value)}
              ></button>
            `,
          )}
          <label class="note-color-custom">
            <span>Custom</span>
            <input
              name="note-color"
              type="color"
              .value=${options.color}
              aria-label="Choose a custom accent color"
              required
              @input=${(event: Event) =>
                options.onColor((event.currentTarget as HTMLInputElement).value)}
            />
          </label>
        </div>
      </fieldset>
      <footer class="note-editor-actions">
        ${
          options.editing
            ? html`<button
                type="button"
                class="mai-button note-editor-delete"
                @click=${options.onDelete}
              >
                Delete
              </button>`
            : nothing
        }
        <span class="note-editor-action-spacer"></span>
        <button type="button" class="mai-button" @click=${options.onDismiss}>Cancel</button>
        <button type="submit" class="mai-button mai-button--primary">Save</button>
      </footer>
    </form>
  `;
}
