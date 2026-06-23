import { beltBand } from '@rto/shared';
import { html } from 'lit';
import { formatPct } from '../lib/format.js';
import { store } from '../state/store.js';
import { RtoElement } from './base.js';
import './belt-chart.js';

export class RtoDashboard extends RtoElement {
  private stat(label: string, value: string, band = '') {
    return html`<div class="mai-card stat ${band}">
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
    </div>`;
  }

  override render() {
    const computed = store.computed();
    const totals = store.totals();
    const target = store.settings.targetBelt;

    const beltVals = computed.filter((w) => w.belt != null).map((w) => w.belt as number);
    const latest = beltVals.at(-1) ?? null;
    const best = beltVals.length ? Math.max(...beltVals) : null;
    const atTarget = beltVals.filter((b) => b >= target).length;

    return html`
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2 class="panel-title">Dashboard</h2>
            <p class="panel-sub">Your rolling BELT trend across ${store.activeYear}.</p>
          </div>
        </div>

        <div class="mai-card chart-card">
          <belt-chart></belt-chart>
        </div>

        <div class="stat-grid">
          ${this.stat('Current BELT', formatPct(latest), latest != null ? `belt-${beltBand(latest)}` : '')}
          ${this.stat('Best week', formatPct(best))}
          ${this.stat(`Weeks ≥ ${formatPct(target)}`, `${atTarget} / ${beltVals.length}`)}
          ${this.stat('Office days (year)', String(totals.officeDays))}
          ${this.stat('DTO days', String(totals.dtoDays))}
        </div>
      </section>
    `;
  }
}

customElements.define('rto-dashboard', RtoDashboard);
