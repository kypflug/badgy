import { html, nothing } from 'lit';
import { store } from '../state/store.js';
import { BadgyElement } from './base.js';

/** How each scheme kind is actually computed, in the user's own terms. */
function schemeExplainer(): { title: string; steps: string[] } {
  const scheme = store.scheme;
  switch (scheme.kind) {
    case 'best-of-window':
      return {
        title: `Best ${scheme.bestCount} of the last ${scheme.windowWeeks} weeks`,
        steps: [
          'Group attendance into Sunday-through-Saturday weeks.',
          `Count days marked In office, capped at ${scheme.weeklyCap} per week.`,
          `Take the ${scheme.bestCount} highest weekly counts from the trailing ${scheme.windowWeeks} weeks.`,
          `Average those counts and divide by ${scheme.weeklyCap} to produce the percentage.`,
        ],
      };
    case 'qualifying-weeks':
      return {
        title: `${scheme.minQualifying} qualifying weeks of the last ${scheme.windowWeeks}`,
        steps: [
          'Group attendance into Sunday-through-Saturday weeks.',
          `A week qualifies when it has at least ${scheme.daysPerWeek} days marked In office.`,
          `Count the qualifying weeks in the trailing ${scheme.windowWeeks}.`,
          `Divide by ${scheme.minQualifying} — the number you need — to produce the percentage.`,
        ],
      };
    case 'weekly-quota':
      return {
        title:
          scheme.averagingWeeks > 1
            ? `${scheme.daysPerWeek} days a week, averaged over ${scheme.averagingWeeks} weeks`
            : `${scheme.daysPerWeek} days a week`,
        steps: [
          'Group attendance into Sunday-through-Saturday weeks.',
          `Each week asks for ${scheme.daysPerWeek} days marked In office.`,
          'Score each week as the office days you managed, divided by the days it asked for.',
          scheme.averagingWeeks > 1
            ? `Average the last ${scheme.averagingWeeks} weeks to produce the percentage.`
            : 'The current week is your percentage — there is no rolling average.',
        ],
      };
    case 'period-quota':
      return {
        title: `${scheme.days} office days each ${scheme.period}`,
        steps: [
          `Count every day marked In office in the current ${scheme.period}.`,
          `Divide by ${scheme.days} — the days that ${scheme.period} asks for.`,
          'The count resets at the start of each period rather than rolling.',
        ],
      };
    case 'period-percentage':
      return {
        title: `${Math.round(scheme.percent * 100)}% of working days each ${scheme.period}`,
        steps: [
          `Count the working days in the current ${scheme.period}.`,
          `Your requirement is ${Math.round(scheme.percent * 100)}% of them.`,
          'Divide your In office days by that requirement to produce the percentage.',
        ],
      };
    case 'none':
      return {
        title: 'No office requirement',
        steps: ['Your workplace sets no office-day quota, so the score always reads 100%.'],
      };
  }
}

export class HelpDialog extends BadgyElement {
  private readonly onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.close();
  };

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('keydown', this.onKeydown);
  }
  override disconnectedCallback(): void {
    document.removeEventListener('keydown', this.onKeydown);
    super.disconnectedCallback();
  }

  private close(): void {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true }));
  }

  override render() {
    const org = store.org;
    const scheme = store.scheme;
    const explainer = schemeExplainer();
    const excused = scheme.absence.excused.length > 0;

    return html`
      <div class="dialog-backdrop" @click=${() => this.close()}></div>
      <div
        class="dialog dialog--help badgy-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
      >
        <header class="dialog-head">
          <h2 class="dialog-title" id="help-title">How Badgy works</h2>
          <button class="badgy-button badgy-button--icon" @click=${() => this.close()} aria-label="Close">
            ✕
          </button>
        </header>

        <section class="help-section">
          <h3 class="setting-title">Your score — ${explainer.title}</h3>
          <p class="help-copy">
            You're set up for <strong>${org.label}</strong>: ${org.summary}. Badgy works it out
            like this:
          </p>
          <ol class="help-list">
            ${explainer.steps.map((s) => html`<li>${s}</li>`)}
          </ol>
          <p class="help-callout">
            Only <strong>In office</strong> counts toward the score${
              scheme.absence.travelCountsAsOffice
                ? html`, plus <strong>Business Travel</strong> because your policy credits it`
                : nothing
            }.
            ${
              excused
                ? html`Time off, Sick and Holiday are treated as excused —
                    ${
                      scheme.absence.proration === 'prorate'
                        ? 'they lower what a period asks of you'
                        : "they don't lower the bar, because the rolling window is itself the allowance"
                    }.`
                : nothing
            }
          </p>
          <p class="help-copy">
            Every one of these numbers lives in <strong>Settings → Workplace policy</strong>. Switch
            workplace to adopt a different policy wholesale, or edit any single value to match how
            your team is actually measured.
          </p>
          ${
            org.assumptions?.length
              ? html`<p class="help-note">
                  ${org.assumptions.length} detail${org.assumptions.length === 1 ? '' : 's'} in the
                  ${org.label} preset ${org.assumptions.length === 1 ? 'is' : 'are'} inferred rather
                  than published — Settings lists exactly which.
                </p>`
              : nothing
          }
        </section>

        <section class="help-section">
          <h3 class="setting-title">Using the calendar</h3>
          <ul class="help-list">
            <li>Click a date to set its status, or drag across dates to update a range.</li>
            <li>
              Switch between Month for detailed tracking and Year for compact annual planning and
              status totals.
            </li>
            <li>
              Use the mouse wheel or trackpad over the calendar to move one month at a time. On
              touch, use a fast vertical flick; slower dragging continues to select dates.
            </li>
            <li>Your usual week supplies defaults; a specific date always overrides its default.</li>
            <li>Past and current days use solid fills. Future plans use dashed outlines.</li>
            <li>The target controls on-track status. The planner estimates office days per week.</li>
            <li>Use undo/redo for edits, zoom for calendar density, and Settings to tune your
              policy, target, holidays and meetup weeks.</li>
            <li>Meetup weeks are highlighted for planning context and never affect your score.</li>
            <li>
              Add a note from a date menu or selected range. Notes outline their inclusive dates
              without changing statuses or your score; click a note label to edit or delete it.
            </li>
            <li>
              Notes can span weeks, months, or years. Overlapping notes and Meetup weeks use a
              multicolor dashed outline and keep every label available.
            </li>
          </ul>
        </section>

        <section class="help-section">
          <h3 class="setting-title">Making it yours</h3>
          <ul class="help-list">
            <li>
              <strong>Workplace policy</strong> seeds your scheme, target and holidays. Nothing is
              locked — switch workplace or hand-edit any value at any time.
            </li>
            <li>
              <strong>Holidays</strong> are filled in from the set you pick in Settings. National
              and employer sets are built in, and you can add or remove single days or import an
              <code>.ics</code> export from Google, Outlook or Apple Calendar.
            </li>
            <li>
              <strong>Meetup weeks</strong> ship with a default set and are fully editable — add or
              remove any week in Settings.
            </li>
            <li>
              Badgy runs client-side. Your attendance document is stored privately in this app's own
              folder in your OneDrive or Google Drive and synchronized across your devices.
            </li>
            <li>
              Policies and holiday sets are plain JSON in the Badgy repository. If yours is missing
              or wrong, a pull request fixes it for everyone.
            </li>
          </ul>
          <p class="help-note">
            Badgy is a personal planning aid, not the official badge or compliance system of record.
          </p>
        </section>
      </div>
    `;
  }
}

customElements.define('help-dialog', HelpDialog);
