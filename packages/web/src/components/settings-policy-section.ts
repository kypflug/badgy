import {
  type ComplianceScheme,
  defaultSchemeFor,
  ORGS,
  type OrgPreset,
  SCHEME_KINDS,
  SCHEME_LABEL,
  type SchemeKind,
} from '@badgy/shared';
import { html, nothing } from 'lit';
import { describeScheme } from '../lib/policy-draft.js';
import { BadgyElement } from './base.js';

const CONFIDENCE_LABEL = {
  official: 'Published by the employer',
  reported: 'Reported by the press',
  community: 'Contributed by the community',
} as const;

/** Numeric knobs for the active scheme kind, so the section renders itself from the taxonomy. */
interface SchemeField {
  label: string;
  help?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  apply: (scheme: ComplianceScheme, value: number) => ComplianceScheme;
}

function schemeFields(scheme: ComplianceScheme): SchemeField[] {
  switch (scheme.kind) {
    case 'best-of-window':
      return [
        {
          label: 'Best weeks counted',
          help: 'Your strongest weeks inside the window',
          value: scheme.bestCount,
          min: 1,
          max: scheme.windowWeeks,
          step: 1,
          apply: (s, v) => ({ ...s, bestCount: v }) as ComplianceScheme,
        },
        {
          label: 'Window',
          help: 'How far back the measurement looks',
          value: scheme.windowWeeks,
          min: 2,
          max: 52,
          step: 1,
          suffix: 'weeks',
          apply: (s, v) => {
            if (s.kind !== 'best-of-window') return s;
            return {
              ...s,
              windowWeeks: v,
              bestCount: Math.min(s.bestCount, v),
            };
          },
        },
        {
          label: 'Days in a full week',
          help: 'The most a single week can contribute',
          value: scheme.weeklyCap,
          min: 1,
          max: 7,
          step: 1,
          apply: (s, v) => ({ ...s, weeklyCap: v }) as ComplianceScheme,
        },
      ];
    case 'qualifying-weeks':
      return [
        {
          label: 'Days to qualify a week',
          help: 'Office days that make a week count',
          value: scheme.daysPerWeek,
          min: 1,
          max: 7,
          step: 1,
          apply: (s, v) => ({ ...s, daysPerWeek: v }) as ComplianceScheme,
        },
        {
          label: 'Qualifying weeks needed',
          help: 'How many must clear the bar',
          value: scheme.minQualifying,
          min: 1,
          max: scheme.windowWeeks,
          step: 1,
          apply: (s, v) => ({ ...s, minQualifying: v }) as ComplianceScheme,
        },
        {
          label: 'Window',
          help: 'How far back the measurement looks',
          value: scheme.windowWeeks,
          min: 2,
          max: 52,
          step: 1,
          suffix: 'weeks',
          apply: (s, v) => {
            if (s.kind !== 'qualifying-weeks') return s;
            return {
              ...s,
              windowWeeks: v,
              minQualifying: Math.min(s.minQualifying, v),
            };
          },
        },
      ];
    case 'weekly-quota':
      return [
        {
          label: 'Office days a week',
          help: 'The weekly requirement',
          value: scheme.daysPerWeek,
          min: 0,
          max: 7,
          step: 1,
          apply: (s, v) => ({ ...s, daysPerWeek: v }) as ComplianceScheme,
        },
        {
          label: 'Averaged over',
          help: 'Set to 1 week for a strict weekly rule',
          value: scheme.averagingWeeks,
          min: 1,
          max: 26,
          step: 1,
          suffix: 'weeks',
          apply: (s, v) => ({ ...s, averagingWeeks: v }) as ComplianceScheme,
        },
      ];
    case 'period-quota':
      return [
        {
          label: `Office days a ${scheme.period}`,
          help: 'Counted across the whole period',
          value: scheme.days,
          min: 1,
          max: 92,
          step: 1,
          apply: (s, v) => ({ ...s, days: v }) as ComplianceScheme,
        },
      ];
    case 'period-percentage':
      return [
        {
          label: `Share of working days a ${scheme.period}`,
          help: 'Of the working days in the period',
          value: Math.round(scheme.percent * 100),
          min: 0,
          max: 100,
          step: 5,
          suffix: '%',
          apply: (s, v) => ({ ...s, percent: v / 100 }) as ComplianceScheme,
        },
      ];
    case 'none':
      return [];
  }
}

/**
 * The Workplace policy section: workplace preset, scheme kind, per-kind numeric knobs and the
 * absence policy. Every write goes out through `onOrgChange` / `onSchemeChange` / `onResetScheme`
 * rather than touching the store directly, so the policy-effect follow-up can swap those three
 * callbacks for local draft + `store.evaluateDraft` / `store.commitPolicyDraft` behavior without
 * rewriting this component's rendering.
 */
export class SettingsPolicySection extends BadgyElement {
  static override properties = {
    org: {},
    scheme: {},
    schemeIsCustom: { type: Boolean },
  };
  org!: OrgPreset;
  scheme!: ComplianceScheme;
  schemeIsCustom = false;

  onOrgChange: (id: string) => void = () => {};
  onSchemeChange: (scheme: ComplianceScheme) => void = () => {};
  onResetScheme: () => void = () => {};

  private setKind(kind: SchemeKind): void {
    this.onSchemeChange(defaultSchemeFor(kind, this.scheme));
  }

  /** Bounded +/- stepper: clamps to the field's taxonomy-derived min/max before applying. */
  private stepField(fieldIndex: number, delta: number): void {
    const field = schemeFields(this.scheme)[fieldIndex];
    const value = Math.min(field.max, Math.max(field.min, field.value + delta));
    this.onSchemeChange(field.apply(this.scheme, value));
  }

  override render() {
    const { org, scheme } = this;
    const fields = schemeFields(scheme);

    return html`
      <div class="policy-card">
        <div class="policy-card-top">
          <label class="field">
            <span class="field-label">Workplace</span>
            <select
              class="select"
              @change=${(e: Event) => this.onOrgChange((e.target as HTMLSelectElement).value)}
            >
              ${ORGS.map(
                (o) => html`<option value=${o.id} ?selected=${o.id === org.id}>${o.label}</option>`,
              )}
            </select>
          </label>
          <p class="policy-formula">${describeScheme(scheme)}</p>
        </div>
        <p class="policy-provenance">
          <span class="org-confidence org-confidence--${org.confidence}"
            >${CONFIDENCE_LABEL[org.confidence]}</span
          >
          ${
            org.effectiveDate
              ? html`<span class="policy-provenance-meta">Effective ${org.effectiveDate}</span>`
              : nothing
          }
          ${
            org.geographicScope
              ? html`<span class="policy-provenance-meta">${org.geographicScope}</span>`
              : nothing
          }
          ${org.sources.map(
            (s) =>
              html`<a class="policy-link" href=${s.url} target="_blank" rel="noreferrer noopener"
                >${s.label}</a
              >`,
          )}
        </p>
        ${
          org.assumptions?.length
            ? html`<details class="policy-assumptions">
                <summary>
                  ${org.assumptions.length} detail${org.assumptions.length === 1 ? ' is' : 's are'}
                  assumed, not published
                </summary>
                <ul class="help-list">
                  ${org.assumptions.map((a) => html`<li>${a}</li>`)}
                </ul>
              </details>`
            : nothing
        }
      </div>

      <div class="policy-numbers">
        <span class="policy-eyebrow">The rule</span>
        <p class="setting-help">
          A workplace only sets starting values — every number here stays yours to change.
        </p>
        <label class="field field--inline">
          <span class="field-label">Measured as</span>
          <select
            class="select"
            @change=${(e: Event) =>
              this.setKind((e.target as HTMLSelectElement).value as SchemeKind)}
          >
            ${SCHEME_KINDS.map(
              (k) =>
                html`<option value=${k} ?selected=${k === scheme.kind}>${SCHEME_LABEL[k]}</option>`,
            )}
          </select>
        </label>
        ${
          scheme.kind === 'period-quota' || scheme.kind === 'period-percentage'
            ? html`<label class="field field--inline">
                <span class="field-label">Period</span>
                <select
                  class="select"
                  @change=${(e: Event) =>
                    this.onSchemeChange({
                      ...scheme,
                      period: (e.target as HTMLSelectElement).value as 'month' | 'quarter',
                    } as ComplianceScheme)}
                >
                  <option value="month" ?selected=${scheme.period === 'month'}>Month</option>
                  <option value="quarter" ?selected=${scheme.period === 'quarter'}>Quarter</option>
                </select>
              </label>`
            : nothing
        }
        ${fields.map(
          (f, i) => html`<div class="field field--inline policy-stepper">
            <span class="policy-stepper-text">
              <span class="field-label">${f.label}</span>
              ${f.help ? html`<span class="setting-help">${f.help}</span>` : nothing}
            </span>
            <div class="stepper" role="group" aria-label=${f.label}>
              <button
                type="button"
                class="badgy-button badgy-button--icon stepper-btn"
                aria-label="Decrease ${f.label}"
                ?disabled=${f.value <= f.min}
                @click=${() => this.stepField(i, -f.step)}
              >
                −
              </button>
              <span class="stepper-value" aria-live="polite"
                >${f.value}${
                  f.suffix ? html` <span class="field-suffix">${f.suffix}</span>` : nothing
                }</span
              >
              <button
                type="button"
                class="badgy-button badgy-button--icon stepper-btn"
                aria-label="Increase ${f.label}"
                ?disabled=${f.value >= f.max}
                @click=${() => this.stepField(i, f.step)}
              >
                +
              </button>
            </div>
          </div>`,
        )}

        <h4 class="setting-subtitle">Time away from the office</h4>
        <label class="toggle-row">
          <input
            type="checkbox"
            .checked=${scheme.absence.travelCountsAsOffice}
            @change=${(e: Event) =>
              this.onSchemeChange({
                ...scheme,
                absence: {
                  ...scheme.absence,
                  travelCountsAsOffice: (e.target as HTMLInputElement).checked,
                },
              })}
          />
          <span>Business travel counts as office time</span>
        </label>
        ${
          scheme.kind === 'best-of-window'
            ? html`<label class="toggle-row">
                  <input type="checkbox" .checked=${false} disabled />
                  <span>Time off is already absorbed by the rolling window</span>
                </label>
                <p class="setting-help">
                  Best-of-window policies count your strongest weeks, so time away does not need a
                  separate weekly proration.
                </p>`
            : html`<label class="toggle-row">
                <input
                  type="checkbox"
                  .checked=${scheme.absence.proration === 'prorate'}
                  @change=${(e: Event) =>
                    this.onSchemeChange({
                      ...scheme,
                      absence: {
                        ...scheme.absence,
                        proration: (e.target as HTMLInputElement).checked ? 'prorate' : 'ignore',
                      },
                    })}
                />
                <span>Time off and holidays reduce the week's requirement</span>
              </label>`
        }
        ${
          this.schemeIsCustom
            ? html`<div class="chip-row">
                <button class="badgy-button" @click=${() => this.onResetScheme()}>
                  Reset to ${org.label} defaults
                </button>
              </div>`
            : nothing
        }
      </div>
    `;
  }
}

customElements.define('settings-policy-section', SettingsPolicySection);
