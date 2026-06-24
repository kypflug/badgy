import { beltBand } from '@rto/shared';
import { html, svg } from 'lit';
import { formatPct } from '../lib/format.js';
import { store } from '../state/store.js';
import { RtoElement } from './base.js';

const R = 24;
const CIRC = 2 * Math.PI * R;

export class ComplianceBar extends RtoElement {
  static override properties = { horizon: { state: true } };
  horizon = 8;

  private ring(value: number | null, band: string) {
    const v = Math.max(0, Math.min(1, value ?? 0));
    return svg`<svg class="ring ${band}" viewBox="0 0 60 60" aria-hidden="true">
      <circle class="ring-bg" cx="30" cy="30" r=${R} />
      <circle class="ring-fg" cx="30" cy="30" r=${R}
        stroke-dasharray=${CIRC} stroke-dashoffset=${CIRC * (1 - v)} />
    </svg>`;
  }

  override render() {
    const c = store.compliance();
    const band = c.current == null ? '' : `belt-${beltBand(c.current)}`;
    const onTrack = c.current != null && c.current + 1e-9 >= c.target;
    const status =
      c.current == null
        ? 'Getting started'
        : onTrack
          ? 'On track'
          : c.current >= c.target - 0.1
            ? 'At risk'
            : 'Off track';

    const plan = store.plan(this.horizon, true);
    let planMsg: string;
    if (!plan.achievable) {
      planMsg = `A full office week still won't hold ${formatPct(c.target)} over ${this.horizon} weeks`;
    } else if (plan.requiredPerWeek === 0) {
      planMsg = `You're set — no extra office days needed to hold ${formatPct(c.target)}`;
    } else {
      const d = plan.requiredPerWeek;
      planMsg = `Aim for ~${d} office ${d === 1 ? 'day' : 'days'}/week to hold ${formatPct(c.target)}`;
    }

    return html`
      <section class="compliance ${band}" aria-label="Compliance">
        <div class="compliance-ring">
          ${this.ring(c.current, band)}
          <span class="ring-value">${formatPct(c.current)}</span>
        </div>
        <div class="compliance-main">
          <div class="compliance-status">${status}</div>
          <div class="compliance-sub">
            BELT now <strong>${formatPct(c.current)}</strong> · target ${formatPct(c.target)} ·
            projected <strong>${formatPct(c.projected)}</strong>
          </div>
        </div>
        <div class="compliance-plan">
          <span class="compliance-plan-msg">${planMsg}</span>
          <label class="compliance-horizon">
            over
            <select
              class="select select--bare"
              @change=${(e: Event) => {
                this.horizon = Number((e.target as HTMLSelectElement).value);
              }}
            >
              ${[4, 8, 12, 16].map(
                (n) => html`<option value=${n} ?selected=${n === this.horizon}>${n} wks</option>`,
              )}
            </select>
          </label>
        </div>
      </section>
    `;
  }
}

customElements.define('compliance-bar', ComplianceBar);
