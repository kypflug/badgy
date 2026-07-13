import { addDays, type PickableStatus, STATUS_LABEL } from '@rto/shared';
import { html, type TemplateResult } from 'lit';
import { STATUS_ICON, STATUS_ORDER, statusClass } from '../lib/status.js';

export function rangeDates(start: string | null, end: string | null): string[] {
  if (!start || !end) return [];
  const [first, last] = start <= end ? [start, end] : [end, start];
  const dates: string[] = [];
  for (let date = first; date <= last; date = addDays(date, 1)) dates.push(date);
  return dates;
}

interface DayMenuOptions {
  x: number;
  y: number;
  onPick: (status: PickableStatus) => void;
  onReset: () => void;
  onDismiss: () => void;
}

export function dayMenu(options: DayMenuOptions): TemplateResult {
  return html`
    <div class="menu-backdrop" @pointerdown=${options.onDismiss}></div>
    <div class="day-menu mai-card" style="left:${options.x}px;top:${options.y}px">
      ${STATUS_ORDER.map(
        (status) => html`
          <button class="day-menu-item" @click=${() => options.onPick(status)}>
            <span class="dmi-dot ${statusClass(status)}">${STATUS_ICON[status]}</span>
            ${STATUS_LABEL[status]}
          </button>
        `,
      )}
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
