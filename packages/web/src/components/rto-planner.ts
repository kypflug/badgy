import { officeDays, requiredOfficeDays } from '@rto/shared';
import { html } from 'lit';
import { currentWeekIndex } from '../lib/dates.js';
import { formatPct } from '../lib/format.js';
import { store } from '../state/store.js';
import { RtoElement } from './base.js';

export class RtoPlanner extends RtoElement {
  static override properties = {
    horizon: { state: true },
    hold: { state: true },
  };
  horizon = 8;
  hold = true;

  private readonly onTarget = (e: Event): void => {
    store.setTarget(Number((e.target as HTMLInputElement).value));
  };

  private readonly onHorizon = (e: Event): void => {
    this.horizon = Math.min(26, Math.max(1, Number((e.target as HTMLInputElement).value) || 1));
  };

  override render() {
    const weeks = store.year().weeks;
    const office = weeks.map((w) => officeDays(w.days));
    const idx = currentWeekIndex(weeks.map((w) => w.weekStart));
    const history = office.slice(0, idx + 1);
    const target = store.settings.targetBelt;
    const goal = this.hold ? 'hold' : 'reach';

    const res = requiredOfficeDays({
      officeSeq: history,
      horizon: this.horizon,
      target,
      hold: this.hold,
    });

    let headline: string;
    let detail: string;
    if (!res.achievable) {
      headline = 'Out of reach';
      detail = `Even a full office week every week won't ${goal} ${formatPct(target)} BELT within ${this.horizon} weeks. Try a longer horizon or a lower target.`;
    } else if (res.requiredPerWeek === 0) {
      headline = "You're already set";
      detail = `Your banked weeks ${goal} ${formatPct(target)} BELT for the next ${this.horizon} weeks with 0 extra office days.`;
    } else {
      const d = res.requiredPerWeek;
      headline = `${d} office ${d === 1 ? 'day' : 'days'} / week`;
      detail = `Aim for about ${d} office ${d === 1 ? 'day' : 'days'} a week over the next ${this.horizon} weeks to ${goal} ${formatPct(target)} BELT.`;
    }

    return html`
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2 class="panel-title">Plan ahead</h2>
            <p class="panel-sub">
              Work out the office days per week you need to ${goal} your target, starting from this week.
            </p>
          </div>
        </div>

        <div class="planner-grid">
          <div class="mai-card planner-controls">
            <label class="field">
              <span class="field-label">Target BELT — ${formatPct(target)}</span>
              <input
                class="range"
                type="range"
                min="0.5"
                max="1"
                step="0.05"
                .value=${String(target)}
                @input=${this.onTarget}
              />
            </label>

            <label class="field">
              <span class="field-label">Horizon (weeks)</span>
              <input
                class="input"
                type="number"
                min="1"
                max="26"
                .value=${String(this.horizon)}
                @input=${this.onHorizon}
              />
            </label>

            <div class="field">
              <span class="field-label">Goal</span>
              <div class="segmented" role="group" aria-label="Goal type">
                <button
                  class="segmented-option ${this.hold ? 'is-active' : ''}"
                  @click=${() => {
                    this.hold = true;
                  }}
                >
                  Hold every week
                </button>
                <button
                  class="segmented-option ${this.hold ? '' : 'is-active'}"
                  @click=${() => {
                    this.hold = false;
                  }}
                >
                  Reach by end
                </button>
              </div>
            </div>
          </div>

          <div class="mai-card planner-result">
            <div class="result-headline">${headline}</div>
            <p class="result-detail">${detail}</p>
            <div class="projection">
              <span class="projection-label">Projected BELT</span>
              <div class="chip-row">
                ${res.projected.map(
                  (b, k) => html`<span class="proj-chip ${this.chipBand(b, target)}">
                    <span class="proj-chip-wk">+${k + 1}</span>
                    <span class="proj-chip-val">${formatPct(b)}</span>
                  </span>`,
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  private chipBand(belt: number | null, target: number): string {
    if (belt == null) return 'proj-chip--none';
    return belt >= target ? 'proj-chip--ok' : 'proj-chip--under';
  }
}

customElements.define('rto-planner', RtoPlanner);
