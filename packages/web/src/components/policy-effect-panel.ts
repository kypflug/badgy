import type { ComplianceResult, ComplianceScheme } from '@badgy/shared';
import { html, svg } from 'lit';
import { formatPct } from '../lib/format.js';
import { buildEffectSeries, describeEffect } from '../lib/policy-draft.js';
import { BadgyElement } from './base.js';

const PLOT_W = 220;
const PLOT_H = 88;

/**
 * The sticky "Effect on your score" panel: old → new headline percentage, an old/new score
 * sparkline on a shared axis, a concise scheme-aware explanation, and the Keep/Revert actions that
 * are the only way a workplace policy draft ever reaches the store. Purely presentational — all
 * the comparison shaping lives in the tested `lib/policy-draft.ts` helpers.
 */
export class PolicyEffectPanel extends BadgyElement {
  static override properties = {
    baseline: {},
    draft: {},
    scheme: {},
    dirty: { type: Boolean },
  };
  baseline!: ComplianceResult;
  draft!: ComplianceResult;
  scheme!: ComplianceScheme;
  dirty = false;

  onKeep: () => void = () => {};
  onRevert: () => void = () => {};

  override render() {
    const { baseline, draft } = this;
    const band = draft.current == null ? '' : (draft.band ?? '');
    const series = buildEffectSeries(baseline, draft, PLOT_W, PLOT_H);
    const targetY = PLOT_H * (1 - Math.min(1, Math.max(0, draft.target)));

    return html`
      <div class="policy-effect">
        <div class="policy-effect-head">
          <span class="policy-effect-title">Effect on your score</span>
        </div>
        <div class="policy-effect-scores">
          <span class="policy-effect-old">${formatPct(baseline.current)}</span>
          <span class="policy-effect-arrow" aria-hidden="true">→</span>
          <span class="policy-effect-new score-${band}">${formatPct(draft.current)}</span>
        </div>
        <svg class="policy-effect-svg" viewBox="0 0 ${PLOT_W} ${PLOT_H}" aria-hidden="true">
          <line
            x1="0"
            x2=${PLOT_W}
            y1=${targetY}
            y2=${targetY}
            class="policy-effect-target"
          />
          ${
            series.oldPoints
              ? svg`<polyline points=${series.oldPoints} class="policy-effect-line policy-effect-line--old" />`
              : ''
          }
          ${
            series.newPoints
              ? svg`<polyline points=${series.newPoints} class="policy-effect-line policy-effect-line--new score-${band}" />`
              : ''
          }
        </svg>
        <p class="policy-effect-explain">${describeEffect(baseline, draft)}</p>
        <div class="policy-effect-actions chip-row">
          <button
            type="button"
            class="badgy-button badgy-button--primary"
            ?disabled=${!this.dirty}
            @click=${() => this.onKeep()}
          >
            Keep it
          </button>
          <button
            type="button"
            class="badgy-button"
            ?disabled=${!this.dirty}
            @click=${() => this.onRevert()}
          >
            Revert
          </button>
        </div>
      </div>
    `;
  }
}

customElements.define('policy-effect-panel', PolicyEffectPanel);
