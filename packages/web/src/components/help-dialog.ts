import { html } from 'lit';
import { RtoElement } from './base.js';

export class HelpDialog extends RtoElement {
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
    return html`
      <div class="dialog-backdrop" @click=${() => this.close()}></div>
      <div
        class="dialog dialog--help mai-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
      >
        <header class="dialog-head">
          <h2 class="dialog-title" id="help-title">How Badgy works</h2>
          <button class="mai-button mai-button--icon" @click=${() => this.close()} aria-label="Close">
            ✕
          </button>
        </header>

        <section class="help-section">
          <h3 class="setting-title">BELT calculation</h3>
          <p class="help-copy">
            BELT means <strong>Best Eight of Last Twelve</strong>. Badgy calculates it in four steps:
          </p>
          <ol class="help-list">
            <li>Group attendance into Sunday-through-Saturday weeks.</li>
            <li>Count days marked <strong>In office</strong>, capped at 5 per week.</li>
            <li>Take the 8 highest weekly counts from the trailing 12 weeks.</li>
            <li>Average those 8 counts and divide by 5 to produce the percentage.</li>
          </ol>
          <p class="help-callout">
            Only <strong>In office</strong> counts. Remote, Time off, Sick, Holiday, Travel,
            OOF/Other, and Untracked do not. Weekend office days count toward the same five-day
            weekly cap.
          </p>
        </section>

        <section class="help-section">
          <h3 class="setting-title">Using the calendar</h3>
          <ul class="help-list">
            <li>Click a date to set its status, or drag across dates to update a range.</li>
            <li>Your usual week supplies defaults; a specific date always overrides its default.</li>
            <li>Past and current days use solid fills. Future plans use dashed outlines.</li>
            <li>The target controls on-track status. The planner estimates office days per week.</li>
            <li>Use undo/redo for edits, zoom for calendar density, and Settings to import Excel data.</li>
            <li>Meetup weeks are highlighted for planning context and do not affect BELT.</li>
          </ul>
        </section>

        <section class="help-section">
          <h3 class="setting-title">Data sources and privacy</h3>
          <ul class="help-list">
            <li>
              The BELT algorithm is transcribed and parity-tested against the Hybrid Attendance
              Modeler spreadsheet.
            </li>
            <li>Company holidays come from the source attendance template.</li>
            <li>Default Meetup weeks follow the published Edge Cycle planning cadence.</li>
            <li>
              Badgy runs client-side. Your attendance document is stored privately in this app's
              folder in your OneDrive and synchronized across your devices.
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
