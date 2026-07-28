import {
  type ComplianceResult,
  type ComplianceScheme,
  HOLIDAY_REGIONS,
  type HolidayRegionId,
  isWeekend,
  orgOrDefault,
  STATUS_LABEL,
  STATUS_SHORT,
  type Status,
  WEEK_DAYS,
  type Weekday,
  weekStartsOfYear,
} from '@badgy/shared';
import { html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { type InteractiveAuthFlow, providerMeta, switchAccount } from '../auth/provider.js';
import { getSession, type Session } from '../auth/session.js';
import { formatPct, formatWeekLabel } from '../lib/format.js';
import {
  draftEqual,
  draftFromOrg,
  draftSchemeIsCustom,
  guardPolicyNavigation,
  type PolicyDraftValue,
} from '../lib/policy-draft.js';
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_SECTIONS,
  type SettingsSectionId,
  type SettingsSummaryContext,
  settingsPaneVisibility,
  summarizeSettingsSection,
} from '../lib/settings-sections.js';
import { STATUS_ORDER, statusClass } from '../lib/status.js';
import { applyMode, getMode, type ThemeMode } from '../lib/theme.js';
import { store } from '../state/store.js';
import { BadgyElement } from './base.js';
import './policy-effect-panel.js';
import './settings-policy-section.js';

const THEME_MODES: { id: ThemeMode; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

const MAX_ICS_BYTES = 2_000_000;

/** Must track the width `.workbench` itself collapses to a single column at (see app.css). */
const MOBILE_BREAKPOINT = 680;

const formatHolidayDate = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });

/**
 * Settings as an in-frame Workbench destination — not a modal. While active it replaces the score
 * rail with a section nav + current-value summaries, and the calendar pane with the selected
 * section's detail (`settingsPaneVisibility` decides which of those show at the current width).
 * `badgy-app.ts` owns entry/exit (the score-rail gear button, Escape, browser history); this
 * component only ever asks to close via the bubbling `close` event, the same contract
 * `help-dialog.ts` uses.
 */
export class SettingsPage extends BadgyElement {
  static override properties = {
    activeSection: { state: true },
    isNarrow: { state: true },
    mode: { state: true },
    holidayYear: { state: true },
    holidayMsg: { state: true },
    accountStage: { state: true },
    accountMessage: { state: true },
    policyDraft: { state: true },
    policyBaseline: { state: true },
    policyDraftResult: { state: true },
    policyBaselineResult: { state: true },
  };

  activeSection: SettingsSectionId | null = null;
  isNarrow = typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT;
  mode: ThemeMode = getMode();
  holidayYear = new Date().getFullYear();
  holidayMsg = '';
  accountStage = 'idle';
  accountMessage = '';
  private accountFlow: InteractiveAuthFlow | null = null;

  /**
   * The Workplace policy draft/effect state. `policyBaseline`/`policyBaselineResult` are fixed at
   * entry (and refreshed by Keep); `policyDraft`/`policyDraftResult` change live as the user edits
   * and are discarded — never written — unless they explicitly Keep. See `lib/policy-draft.ts`.
   */
  policyDraft: PolicyDraftValue | null = null;
  policyBaseline: PolicyDraftValue | null = null;
  policyDraftResult: ComplianceResult | null = null;
  policyBaselineResult: ComplianceResult | null = null;
  /**
   * Set right before an in-app close that already passed the guard, so the popstate it triggers
   * via `history.back()` doesn't prompt a second time.
   */
  private suppressCloseGuardOnce = false;

  private readonly onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.close();
  };
  private readonly onResize = (): void => {
    this.isNarrow = window.innerWidth <= MOBILE_BREAKPOINT;
  };

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('keydown', this.onKeydown);
    window.addEventListener('resize', this.onResize);
    // Desktop always shows a detail; narrow viewports start on the section list instead.
    if (!this.isNarrow) this.activeSection ??= DEFAULT_SETTINGS_SECTION;
  }
  override disconnectedCallback(): void {
    document.removeEventListener('keydown', this.onKeydown);
    window.removeEventListener('resize', this.onResize);
    super.disconnectedCallback();
  }
  override firstUpdated(): void {
    const target =
      this.querySelector<HTMLElement>('.settings-back') ??
      this.querySelector<HTMLElement>('.settings-detail-title');
    target?.focus();
  }
  override updated(changed: PropertyValues<this>): void {
    if (
      changed.has('activeSection') &&
      this.activeSection === 'workplace-policy' &&
      !this.policyDraft
    ) {
      this.initPolicyDraft();
    }
    if (!changed.has('activeSection') || !this.isNarrow) return;
    const target = this.activeSection
      ? this.querySelector<HTMLElement>('.settings-detail-title')
      : this.querySelector<HTMLElement>('.settings-nav-item');
    target?.focus();
  }

  /** True while there's an open, uncommitted workplace policy edit. */
  private policyDirty(): boolean {
    return (
      !!this.policyDraft &&
      !!this.policyBaseline &&
      !draftEqual(this.policyDraft, this.policyBaseline)
    );
  }
  private confirmLeavePolicyIfDirty(): boolean {
    return guardPolicyNavigation(this.policyDirty());
  }
  /**
   * Called by `badgy-app.ts` before honoring a real browser Back (or forward-restoring one it
   * cancelled). Returns `false` to mean "stay put" — Settings remains open and its history entry
   * must be restored. A `close()`-initiated `history.back()` already ran this guard, so that one
   * pass is suppressed here to avoid double-prompting.
   */
  confirmDiscardForClose(): boolean {
    if (this.suppressCloseGuardOnce) {
      this.suppressCloseGuardOnce = false;
      return true;
    }
    return this.confirmLeavePolicyIfDirty();
  }

  /** Whether local policy editing should own undo/redo keyboard shortcuts. */
  hasActivePolicyDraft(): boolean {
    return this.activeSection === 'workplace-policy' && this.policyDraft !== null;
  }

  private close(): void {
    if (!this.confirmLeavePolicyIfDirty()) return;
    this.suppressCloseGuardOnce = true;
    this.dispatchEvent(new CustomEvent('close', { bubbles: true }));
  }
  private selectSection(id: SettingsSectionId): void {
    if (id === this.activeSection) return;
    if (!this.confirmLeavePolicyIfDirty()) return;
    if (this.policyDirty()) this.clearPolicyDraft();
    if (id === 'workplace-policy') this.initPolicyDraft();
    this.activeSection = id;
  }
  private backToList(): void {
    if (!this.confirmLeavePolicyIfDirty()) return;
    if (this.policyDirty()) this.clearPolicyDraft();
    this.activeSection = null;
  }

  // --- workplace policy draft/effect ---

  private clearPolicyDraft(): void {
    this.policyDraft = null;
    this.policyBaseline = null;
    this.policyDraftResult = null;
    this.policyBaselineResult = null;
  }

  /** Seed the draft from the currently *committed* org/scheme/target/holiday region. */
  private initPolicyDraft(): void {
    const baseline: PolicyDraftValue = {
      orgId: store.org.id,
      scheme: store.scheme,
      target: store.target,
      holidayRegion: store.holidayRegion,
    };
    this.policyBaseline = baseline;
    this.policyDraft = { ...baseline };
    this.policyBaselineResult = store.compliance();
    this.policyDraftResult = this.policyBaselineResult;
  }
  private updatePolicyDraft(next: PolicyDraftValue): void {
    this.policyDraft = next;
    this.policyDraftResult = store.evaluateDraft(next);
  }
  private onPolicyOrgChange(id: string): void {
    this.updatePolicyDraft(draftFromOrg(orgOrDefault(id)));
  }
  private onPolicySchemeChange(scheme: ComplianceScheme): void {
    if (!this.policyDraft) return;
    this.updatePolicyDraft({ ...this.policyDraft, scheme });
  }
  private onPolicyResetScheme(): void {
    if (!this.policyDraft) return;
    const org = orgOrDefault(this.policyDraft.orgId);
    this.updatePolicyDraft({ ...this.policyDraft, scheme: org.scheme });
  }
  /** The only path a workplace policy draft ever reaches the store — one atomic commit. */
  private keepPolicy(): void {
    if (!this.policyDraft) return;
    store.commitPolicyDraft(this.policyDraft);
    this.policyBaseline = { ...this.policyDraft };
    this.policyBaselineResult = store.compliance();
    this.policyDraftResult = this.policyBaselineResult;
  }
  private revertPolicy(): void {
    if (!this.policyBaseline) return;
    this.policyDraft = { ...this.policyBaseline };
    this.policyDraftResult = this.policyBaselineResult;
  }

  private setTheme(m: ThemeMode): void {
    applyMode(m);
    this.mode = m;
  }
  private setRegion(region: HolidayRegionId): void {
    store.setHolidayRegion(region);
    this.holidayMsg = '';
  }
  private addHoliday(value: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    if (store.isHoliday(value)) {
      this.holidayMsg = 'That date is already a holiday.';
      return;
    }
    store.addHoliday(value);
    this.holidayYear = Number(value.slice(0, 4));
    this.holidayMsg = '';
  }
  private resetHolidays(): void {
    store.resetHolidays();
    this.holidayMsg = 'Restored the region defaults.';
  }
  private async onImportIcs(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_ICS_BYTES) {
      this.holidayMsg = 'That file is too large — export a single year and try again.';
      return;
    }
    this.holidayMsg = 'Reading…';
    try {
      const { parseIcs } = await import('../lib/import-ics.js');
      const { holidays, skipped } = parseIcs(await file.text());
      const added = store.importHolidays(holidays);
      const skippedNote = skipped ? `, skipped ${skipped} undated` : '';
      this.holidayMsg = added
        ? `Added ${added} holiday${added === 1 ? '' : 's'}${skippedNote}.`
        : `No new dates to add${skippedNote}.`;
      if (added && holidays[0]) this.holidayYear = Number(holidays[0].date.slice(0, 4));
    } catch (err) {
      this.holidayMsg =
        err instanceof Error && err.message ? err.message : "Couldn't read that .ics file.";
    }
  }
  private beginAccountSwitch(): void {
    this.accountMessage = '';
    if (this.accountFlow?.snapshot.stage === 'blocked') {
      this.accountFlow.openProvider();
      this.accountStage = this.accountFlow.snapshot.stage;
      return;
    }
    const flow = switchAccount(getSession()?.provider);
    this.accountFlow = flow;
    const update = (): void => {
      this.accountStage = flow.snapshot.stage;
    };
    flow.addEventListener('change', update);
    update();
    void flow.completion
      .then(() => window.location.reload())
      .catch(() => {
        this.accountStage = 'failed';
      });
  }
  private async endSession(): Promise<void> {
    const session = getSession();
    if (!session) return;
    this.accountMessage = 'Signing out…';
    const complete = await session.signOut();
    if (!complete)
      this.accountMessage = 'Sign-out could not reach the server. Try again when connected.';
  }
  private accountSwitchLabel(): string {
    const name = providerMeta(getSession()?.provider ?? 'microsoft').label;
    if (this.accountStage === 'starting') return 'Preparing…';
    if (this.accountStage === 'waiting') return `Finish in ${name}…`;
    if (this.accountStage === 'blocked') return `Open ${name} sign-in`;
    if (this.accountStage === 'failed') return 'Try switching again';
    return 'Use another account';
  }

  private renderNav(session: Session | null, activeId: SettingsSectionId): TemplateResult {
    const year = new Date().getFullYear();
    const ctx: SettingsSummaryContext = {
      pattern: store.pattern,
      org: store.org,
      scheme: store.scheme,
      target: store.target,
      holidayRegion: store.holidayRegion,
      holidayCount: store.holidaysInYear(year).length,
      meetupCount: weekStartsOfYear(year).filter((w) => store.isMeetupWeek(w)).length,
      theme: this.mode,
      accountName: session?.name ?? null,
    };
    const sections = SETTINGS_SECTIONS.filter((s) => s.id !== 'account' || !!session);
    const storageLabel = session
      ? providerMeta(session.provider).label === 'Google'
        ? 'Google Drive'
        : 'OneDrive'
      : 'cloud storage';

    return html`
      <aside class="rail settings-rail" data-view="settings" aria-label="Settings">
        <div class="rail-brand settings-rail-head">
          <button
            class="badgy-button badgy-button--icon settings-back"
            @click=${() => this.close()}
            aria-label="Back to calendar"
            title="Back to calendar"
          >
            ‹
          </button>
          <span class="brand-name rail-brand-name settings-rail-title" id="settings-title">
            Settings
          </span>
        </div>
        <nav class="settings-nav-list" aria-label="Settings sections">
          ${sections.map((s) => {
            const isActive = !this.isNarrow && s.id === activeId;
            return html`
              <button
                type="button"
                class="settings-nav-item ${isActive ? 'is-active' : ''}"
                aria-current=${isActive ? 'page' : nothing}
                @click=${() => this.selectSection(s.id)}
              >
                <span class="settings-nav-label">${s.label}</span>
                <span class="settings-nav-summary">${summarizeSettingsSection(s.id, ctx)}</span>
              </button>
            `;
          })}
        </nav>
        <p class="settings-reassurance rail-caption">
          Your attendance stays private in ${storageLabel}. Workplace policy edits apply only when
          you choose Keep it.
        </p>
      </aside>
    `;
  }

  private renderDetail(session: Session | null, activeId: SettingsSectionId): TemplateResult {
    const label = SETTINGS_SECTIONS.find((s) => s.id === activeId)?.label ?? '';
    return html`
      <div class="pane settings-pane">
        <div class="view-bar settings-detail-head">
          ${
            this.isNarrow
              ? html`<button
                  class="badgy-button badgy-button--icon"
                  aria-label="Back to sections"
                  @click=${() => this.backToList()}
                >
                  ‹
                </button>`
              : nothing
          }
          <h1 class="view-title settings-detail-title" tabindex="-1">${label}</h1>
        </div>
        <div class="settings-detail-body">${this.renderSection(activeId, session)}</div>
      </div>
    `;
  }

  private renderSection(
    id: SettingsSectionId,
    session: Session | null,
  ): TemplateResult | typeof nothing {
    switch (id) {
      case 'usual-week':
        return this.renderUsualWeek();
      case 'workplace-policy':
        return this.renderWorkplacePolicy();
      case 'target':
        return this.renderTarget();
      case 'holidays':
        return this.renderHolidays();
      case 'meetup-weeks':
        return this.renderMeetupWeeks();
      case 'appearance':
        return this.renderAppearance();
      case 'account':
        return session ? this.renderAccount(session) : nothing;
    }
  }

  private renderUsualWeek(): TemplateResult {
    const pattern = store.pattern;
    return html`
      <section class="setting">
        <p class="setting-help">
          Default for any day you haven't set. Specific dates override this.
        </p>
        <div class="pattern-calendar" role="group" aria-label="Usual week defaults">
          ${WEEK_DAYS.map((w) => {
            const current = pattern[w.idx] ?? (isWeekend(w.idx) ? 'none' : 'office');
            return html`<label
                class="pattern-calendar-day ${statusClass(current)} ${
                  current === 'none' ? 'pattern-calendar-day--untracked' : ''
                }"
              >
                <span class="pattern-calendar-dow">${w.short}</span>
                <span class="pattern-calendar-status">
                  ${current === 'none' ? STATUS_LABEL.none : STATUS_SHORT[current]}
                </span>
                ${
                  current === 'none'
                    ? nothing
                    : html`<span class="pattern-calendar-bar" aria-hidden="true"></span>`
                }
                <select
                  class="pattern-calendar-select"
                  aria-label=${`${w.label} default: ${STATUS_LABEL[current]}`}
                  title=${`${w.label}: ${STATUS_LABEL[current]}`}
                  @change=${(e: Event) =>
                    store.setPattern(
                      w.idx as Weekday,
                      (e.target as HTMLSelectElement).value as Status,
                    )}
                >
                  ${(isWeekend(w.idx) ? [...STATUS_ORDER, 'none' as const] : STATUS_ORDER).map(
                    (s) => html`<option value=${s} ?selected=${current === s}>
                      ${STATUS_LABEL[s]}
                    </option>`,
                  )}
                </select>
              </label>`;
          })}
        </div>
      </section>
    `;
  }

  private renderWorkplacePolicy(): TemplateResult | typeof nothing {
    if (
      !this.policyDraft ||
      !this.policyBaseline ||
      !this.policyDraftResult ||
      !this.policyBaselineResult
    ) {
      return nothing;
    }
    const draft = this.policyDraft;
    const draftResult = this.policyDraftResult;
    const baselineResult = this.policyBaselineResult;
    const org = orgOrDefault(draft.orgId);
    return html`
      <section class="setting policy-setting">
        <settings-policy-section
          .org=${org}
          .scheme=${draft.scheme}
          .schemeIsCustom=${draftSchemeIsCustom(draft.scheme, org)}
          .onOrgChange=${(id: string) => this.onPolicyOrgChange(id)}
          .onSchemeChange=${(next: ComplianceScheme) => this.onPolicySchemeChange(next)}
          .onResetScheme=${() => this.onPolicyResetScheme()}
        ></settings-policy-section>
        <policy-effect-panel
          class="policy-effect-sticky"
          .baseline=${baselineResult}
          .draft=${draftResult}
          .scheme=${draft.scheme}
          .dirty=${this.policyDirty()}
          .onKeep=${() => this.keepPolicy()}
          .onRevert=${() => this.revertPolicy()}
        ></policy-effect-panel>
      </section>
    `;
  }

  private renderTarget(): TemplateResult {
    return html`
      <section class="setting">
        <p class="setting-help">Drives the "on track?" indicator and the planner.</p>
        <div class="field field--inline">
          <span class="field-label">Target</span>
          <input
            class="range"
            type="range"
            min="0.5"
            max="1"
            step="0.05"
            .value=${String(store.target)}
            @input=${(e: Event) => store.setTarget(Number((e.target as HTMLInputElement).value))}
          />
          <span class="setting-value">${formatPct(store.target)}</span>
        </div>
      </section>
    `;
  }

  private renderAppearance(): TemplateResult {
    return html`
      <section class="setting">
        <div class="segmented" role="group" aria-label="Theme">
          ${THEME_MODES.map(
            (t) => html`<button
              class="segmented-option ${this.mode === t.id ? 'is-active' : ''}"
              @click=${() => this.setTheme(t.id)}
            >
              ${t.label}
            </button>`,
          )}
        </div>
      </section>
    `;
  }

  private renderMeetupWeeks(): TemplateResult {
    const year = new Date().getFullYear();
    const weekStarts = weekStartsOfYear(year);
    const meetups = weekStarts.filter((w) => store.isMeetupWeek(w));
    const nonMeetups = weekStarts.filter((w) => !store.isMeetupWeek(w));
    return html`
      <section class="setting">
        <p class="setting-help">
          Highlighted on the calendar for ${year}; they never affect your score.
        </p>
        <div class="chip-row">
          ${
            meetups.length
              ? meetups.map(
                  (m) => html`<button
                    class="chip chip--meetup"
                    @click=${() => store.toggleMeetup(m)}
                  >
                    ${formatWeekLabel(m)} ✕
                  </button>`,
                )
              : html`<span class="setting-help">None marked.</span>`
          }
        </div>
        <label class="field field--inline">
          <span class="field-label">Add</span>
          <select
            class="select"
            @change=${(e: Event) => {
              const v = (e.target as HTMLSelectElement).value;
              if (v) store.toggleMeetup(v);
              (e.target as HTMLSelectElement).value = '';
            }}
          >
            <option value="">Pick a week…</option>
            ${nonMeetups.map((m) => html`<option value=${m}>${formatWeekLabel(m)}</option>`)}
          </select>
        </label>
      </section>
    `;
  }

  private renderHolidays(): TemplateResult {
    const region = store.holidayRegion;
    const regionNote = HOLIDAY_REGIONS.find((r) => r.id === region)?.note;
    const holidays = store.holidaysInYear(this.holidayYear);
    return html`
      <section class="setting">
        <p class="setting-help">
          Holidays fill in automatically and never count toward your score. Pick the set that
          matches your organization, then add or remove individual days.
        </p>
        <label class="field field--inline">
          <span class="field-label">Region</span>
          <select
            class="select"
            @change=${(e: Event) =>
              this.setRegion((e.target as HTMLSelectElement).value as HolidayRegionId)}
          >
            ${HOLIDAY_REGIONS.map(
              (r) => html`<option value=${r.id} ?selected=${r.id === region}>${r.label}</option>`,
            )}
          </select>
        </label>
        ${regionNote ? html`<p class="setting-help">${regionNote}</p>` : nothing}

        <div class="field field--inline">
          <span class="field-label">Year</span>
          <div class="chip-row">
            <button
              class="badgy-button badgy-button--icon"
              aria-label="Previous year"
              @click=${() => {
                this.holidayYear--;
              }}
            >
              ‹
            </button>
            <span class="setting-value">${this.holidayYear}</span>
            <button
              class="badgy-button badgy-button--icon"
              aria-label="Next year"
              @click=${() => {
                this.holidayYear++;
              }}
            >
              ›
            </button>
          </div>
        </div>

        <div class="chip-row">
          ${
            holidays.length
              ? holidays.map(
                  (h) => html`<button
                    class="chip chip--holiday"
                    title=${`${h.name} — remove`}
                    @click=${() => store.removeHoliday(h.date)}
                  >
                    ${formatHolidayDate(h.date)} ${h.name} ✕
                  </button>`,
                )
              : html`<span class="setting-help">No holidays in ${this.holidayYear}.</span>`
          }
        </div>

        <div class="chip-row">
          <label class="field field--inline">
            <span class="field-label">Add</span>
            <input
              class="select"
              type="date"
              @change=${(e: Event) => {
                const input = e.target as HTMLInputElement;
                this.addHoliday(input.value);
                input.value = '';
              }}
            />
          </label>
          <label class="badgy-button import-button">
            Import .ics…
            <input
              type="file"
              accept=".ics,text/calendar"
              @change=${(e: Event) => void this.onImportIcs(e)}
              hidden
            />
          </label>
          <button class="badgy-button" @click=${() => this.resetHolidays()}>
            Reset to defaults
          </button>
        </div>
        ${this.holidayMsg ? html`<p class="setting-help">${this.holidayMsg}</p>` : nothing}
      </section>
    `;
  }

  private renderAccount(session: Session): TemplateResult {
    return html`
      <section class="setting">
        <p class="setting-help">
          Signed in as <strong>${session.name}</strong>. Your data lives in your
          ${providerMeta(session.provider).label === 'Google' ? 'Google Drive' : 'OneDrive'}.
        </p>
        <div class="chip-row">
          <button
            class="badgy-button"
            @click=${() => this.beginAccountSwitch()}
            ?disabled=${this.accountStage === 'starting' || this.accountStage === 'waiting'}
          >
            ${this.accountSwitchLabel()}
          </button>
          <button class="badgy-button" @click=${() => void this.endSession()}>Sign out</button>
        </div>
        ${
          this.accountMessage
            ? html`<p class="setting-help" role="status">${this.accountMessage}</p>`
            : nothing
        }
      </section>
    `;
  }

  override render() {
    const session = getSession();
    const activeId = this.activeSection ?? DEFAULT_SETTINGS_SECTION;
    const { showNav, showDetail } = settingsPaneVisibility(this.isNarrow, this.activeSection);
    return html`
      ${showNav ? this.renderNav(session, activeId) : nothing}
      ${showDetail ? this.renderDetail(session, activeId) : nothing}
    `;
  }
}

customElements.define('settings-page', SettingsPage);
