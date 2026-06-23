import { LitElement } from 'lit';
import { store } from '../state/store.js';

/**
 * Base for all app components. Renders into light DOM so the global, token-driven
 * `app.css` applies uniformly, and re-renders whenever the store changes.
 */
export class RtoElement extends LitElement {
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  private readonly onStoreChange = (): void => {
    this.requestUpdate();
  };

  override connectedCallback(): void {
    super.connectedCallback();
    store.addEventListener('change', this.onStoreChange);
  }

  override disconnectedCallback(): void {
    store.removeEventListener('change', this.onStoreChange);
    super.disconnectedCallback();
  }
}
