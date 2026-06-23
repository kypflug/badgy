import { beltBand } from '@rto/shared';
import { html, svg } from 'lit';
import { pctLabel } from '../lib/format.js';
import { store } from '../state/store.js';
import { RtoElement } from './base.js';

const W = 760;
const H = 280;
const PAD_L = 40;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 26;

export class BeltChart extends RtoElement {
  override render() {
    const data = store.computed();
    const target = store.settings.targetBelt;
    const n = Math.max(data.length, 2);
    const scored = data
      .map((d, i) => ({ i, belt: d.belt }))
      .filter((p): p is { i: number; belt: number } => p.belt != null);

    const x = (i: number): number => PAD_L + (i / (n - 1)) * (W - PAD_L - PAD_R);
    const y = (v: number): number => PAD_T + (1 - v) * (H - PAD_T - PAD_B);

    const path = scored
      .map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.belt).toFixed(1)}`)
      .join(' ');

    return html`<svg
      class="belt-chart"
      viewBox="0 0 ${W} ${H}"
      preserveAspectRatio="none"
      role="img"
      aria-label="BELT trend across the year"
    >
      ${[0, 0.25, 0.5, 0.75, 1].map(
        (v) => svg`
          <line class="chart-grid" x1=${PAD_L} y1=${y(v)} x2=${W - PAD_R} y2=${y(v)} />
          <text class="chart-axis" x=${PAD_L - 6} y=${y(v) + 3} text-anchor="end">${pctLabel(v)}</text>`,
      )}
      <line class="chart-guide chart-guide--warning" x1=${PAD_L} y1=${y(0.8)} x2=${W - PAD_R} y2=${y(0.8)} />
      <line class="chart-guide chart-guide--success" x1=${PAD_L} y1=${y(0.9)} x2=${W - PAD_R} y2=${y(0.9)} />
      <line class="chart-guide chart-guide--target" x1=${PAD_L} y1=${y(target)} x2=${W - PAD_R} y2=${y(target)} />
      <text class="chart-axis chart-axis--target" x=${W - PAD_R} y=${y(target) - 5} text-anchor="end">
        Target ${pctLabel(target)}
      </text>
      ${path ? svg`<path class="belt-line" d=${path} />` : svg``}
      ${scored.map(
        (p) => svg`<circle
          class="belt-dot belt-${beltBand(p.belt)}"
          cx=${x(p.i)}
          cy=${y(p.belt)}
          r="3.5"
        ><title>Week ${p.i + 1}: ${pctLabel(p.belt)}</title></circle>`,
      )}
      ${
        scored.length === 0
          ? svg`<text class="chart-empty" x=${W / 2} y=${H / 2} text-anchor="middle">Track 13 weeks to see your BELT trend.</text>`
          : svg``
      }
    </svg>`;
  }
}

customElements.define('belt-chart', BeltChart);
