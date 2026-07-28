import { addDays, type CalendarNote } from '@badgy/shared';
import { html, nothing, type TemplateResult } from 'lit';

export interface CalendarAnnotation {
  id: string;
  kind: 'meetup' | 'note';
  start: string;
  end: string;
  label: string;
  color: string;
  note?: CalendarNote;
}

export interface AnnotationSegment {
  id: string;
  start: string;
  end: string;
  startColumn: number;
  endColumn: number;
  annotations: readonly CalendarAnnotation[];
  colors: readonly string[];
  collision: boolean;
}

export function noteAnnotation(note: CalendarNote): CalendarAnnotation {
  return { ...note, kind: 'note', note };
}

export function meetupAnnotation(weekStart: string, label: string): CalendarAnnotation {
  return {
    id: `meetup-${weekStart}`,
    kind: 'meetup',
    start: weekStart,
    end: addDays(weekStart, 6),
    label,
    color: 'var(--badgy-meetup)',
  };
}

function annotationOrder(a: CalendarAnnotation, b: CalendarAnnotation): number {
  return (
    a.kind.localeCompare(b.kind) ||
    a.start.localeCompare(b.start) ||
    a.end.localeCompare(b.end) ||
    a.label.localeCompare(b.label) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Partition a Sunday–Saturday row wherever its active annotation set changes.
 * This makes collision styling exact while retaining every colliding label.
 */
export function layoutWeekAnnotations(
  weekStart: string,
  annotations: readonly CalendarAnnotation[],
  visibleStart = weekStart,
  visibleEnd = addDays(weekStart, 6),
): AnnotationSegment[] {
  const ordered = [...annotations].sort(annotationOrder);
  const activeByDay: CalendarAnnotation[][] = [];
  for (let column = 0; column < 7; column++) {
    const date = addDays(weekStart, column);
    activeByDay.push(
      date < visibleStart || date > visibleEnd
        ? []
        : ordered.filter((annotation) => annotation.start <= date && annotation.end >= date),
    );
  }

  const segments: AnnotationSegment[] = [];
  let column = 0;
  while (column < 7) {
    const active = activeByDay[column];
    if (active.length === 0) {
      column++;
      continue;
    }
    const signature = active.map((annotation) => annotation.id).join('\u0000');
    let endColumn = column;
    while (
      endColumn + 1 < 7 &&
      activeByDay[endColumn + 1].map((annotation) => annotation.id).join('\u0000') === signature
    )
      endColumn++;
    const colors = [...new Set(active.map((annotation) => annotation.color))];
    segments.push({
      id: `${column}-${endColumn}-${signature}`,
      start: addDays(weekStart, column),
      end: addDays(weekStart, endColumn),
      startColumn: column,
      endColumn,
      annotations: active,
      colors,
      collision: active.length > 1,
    });
    column = endColumn + 1;
  }
  return segments;
}

/**
 * One outline per distinct colour, stacked at identical geometry. The first is solid and the
 * rest are dashed/dotted on top, so a span covered by two notes reads as an edge alternating
 * between their colours — uniform at any segment aspect ratio, unlike a stretched SVG.
 */
function outlines(segment: AnnotationSegment): TemplateResult[] {
  return segment.colors.map(
    (color, index) => html`<span
      class="annotation-outline"
      data-outline=${String(Math.min(index, 2))}
      style=${`--annotation-color:${color}`}
    ></span>`,
  );
}

export function annotationOverlay(
  segments: readonly AnnotationSegment[],
  onEdit: (note: CalendarNote) => void,
): TemplateResult | typeof nothing {
  if (segments.length === 0) return nothing;
  return html`<div class="annotation-layer">
    ${segments.map(
      (segment) => html`
        <div
          class="annotation-segment ${segment.collision ? 'annotation-segment--collision' : ''}"
          style=${`grid-column:${segment.startColumn + 1}/${segment.endColumn + 2}`}
          role="group"
          aria-label=${segment.annotations.map((annotation) => annotation.label).join(', ')}
        >
          ${outlines(segment)}
          <span class="annotation-labels">
            ${segment.annotations.map((annotation) =>
              annotation.note
                ? html`<button
                    type="button"
                    class="annotation-label"
                    style=${`--annotation-color:${annotation.color}`}
                    title=${annotation.label}
                    aria-label=${`Edit note: ${annotation.label}, ${annotation.start} through ${annotation.end}`}
                    @pointerdown=${(event: Event) => event.stopPropagation()}
                    @click=${(event: Event) => {
                      event.stopPropagation();
                      onEdit(annotation.note as CalendarNote);
                    }}
                  >
                    ${annotation.label}
                  </button>`
                : html`<span
                    class="annotation-label annotation-label--meetup"
                    style=${`--annotation-color:${annotation.color}`}
                    title=${annotation.label}
                  >
                    ${annotation.label}
                  </span>`,
            )}
          </span>
        </div>
      `,
    )}
  </div>`;
}
