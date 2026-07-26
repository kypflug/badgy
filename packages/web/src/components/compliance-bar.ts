import { addDays } from '@badgy/shared';
import { html, svg, type TemplateResult } from 'lit';
import { formatPct } from '../lib/format.js';
import { store } from '../state/store.js';
import { BadgyElement } from './base.js';

const R = 24;
const CIRC = 2 * Math.PI * R;
const HORIZON = 8;
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

export class ComplianceBar extends BadgyElement {
  private ring(value: number | null, band: string) {
    const v = Math.max(0, Math.min(1, value ?? 0));
    return svg`<svg class="ring ${band}" viewBox="0 0 60 60" aria-hidden="true">
      <circle class="ring-bg" cx="30" cy="30" r=${R} />
      <circle class="ring-fg" cx="30" cy="30" r=${R}
        stroke-dasharray=${CIRC} stroke-dashoffset=${CIRC * (1 - v)} />
    </svg>`;
  }

  private stat(label: string, value: string) {
    return html`<div class="stat">
      <span class="stat-label">${label}</span><span class="stat-val">${value}</span>
    </div>`;
  }

  private spark(series: readonly { score: number | null }[]) {
    return html`<div class="spark" aria-hidden="true">
      ${series.map((w) => {
        if (w.score == null) return html`<span class="spark-bar spark-bar--empty"></span>`;
        const h = Math.max(10, Math.round(w.score * 100));
        return html`<span class="spark-bar score-${store.band(w.score)}" style="height:${h}%"></span>`;
      })}
    </div>`;
  }

  override render() {
    const c = store.compliance();
    const noQuota = store.scheme.kind === 'none';
    const band = c.current == null ? '' : `score-${store.band(c.current)}`;
    const onTrack = c.current != null && c.current + 1e-9 >= c.target;
    const status =
      c.current == null
        ? 'Getting started'
        : noQuota
          ? 'No requirement'
          : onTrack
            ? 'On track'
            : c.current >= c.target - 0.1
              ? 'At risk'
              : 'Off track';
    const pts = c.current == null ? null : Math.round((c.current - c.target) * 100);
    const sub = noQuota
      ? store.org.summary
      : pts == null
        ? 'building your first weeks'
        : pts > 0
          ? `${pts} pts above target`
          : pts < 0
            ? `${-pts} pts below target`
            : 'right at target';

    const trend = c.series.slice(-12);
    const endMonth = MONTHS[Number(addDays(store.today(), HORIZON * 7).slice(5, 7)) - 1];
    let planBody: TemplateResult;
    if (noQuota) {
      planBody = html`Your workplace sets no office-day requirement — the calendar is yours for
        planning.`;
    } else {
      const plan = store.plan(HORIZON, true);
      if (!plan.achievable) {
        planBody = html`Even a <strong>full office week</strong> won't hold
          <strong>${formatPct(c.target)}</strong> through <strong>${endMonth}</strong>.`;
      } else if (plan.requiredPerWeek === 0) {
        planBody = html`You're set to stay above <strong>${formatPct(c.target)}</strong> through
          <strong>${endMonth}</strong> — no extra office days needed.`;
      } else {
        const d = plan.requiredPerWeek;
        planBody = html`Hold <strong>~${d} office ${d === 1 ? 'day' : 'days'}</strong> a week to stay
          above <strong>${formatPct(c.target)}</strong> through <strong>${endMonth}</strong>.`;
      }
    }

    return html`
      <section class="compliance ${band}" aria-label="Compliance summary">
        <div class="cmp-headline">
          <div class="compliance-ring">
            ${this.ring(c.current, band)}<span class="ring-value">${formatPct(c.current)}</span>
          </div>
          <div class="cmp-status">
            <div class="compliance-status">${status}</div>
            <div class="cmp-sub">${sub}</div>
          </div>
        </div>
        <div class="cmp-stats">
          ${this.stat('Now', formatPct(c.current))}
          ${this.stat('Target', formatPct(c.target))}
          ${this.stat('Proj.', formatPct(c.projected))}
        </div>
        <div class="cmp-trend">
          <span class="cmp-trend-label">${trend.length}-${c.unit} trend</span>
          ${this.spark(trend)}
        </div>
        <p class="cmp-plan">${planBody}</p>
      </section>
    `;
  }
}

customElements.define('compliance-bar', ComplianceBar);
