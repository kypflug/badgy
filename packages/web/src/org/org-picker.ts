/**
 * Workplace picker — the discovery surface for the bundled policy presets, shown from the sign-in
 * card and from Settings. Plain DOM rather than a Lit component so the signed-out card can open it
 * without pulling in the app bundle.
 */
import { ORGS, type OrgPreset } from '@badgy/shared';

const CONFIDENCE_LABEL: Record<OrgPreset['confidence'], string> = {
  official: 'Published by the employer',
  reported: 'Reported by the press',
  community: 'Contributed by the community',
};

function card(org: OrgPreset): string {
  const assumptions = org.assumptions?.length ?? 0;
  return `
    <button class="org-card" type="button" data-org="${org.id}">
      <span class="org-card-name">${org.label}</span>
      <span class="org-card-summary">${org.summary}</span>
      <span class="org-card-meta">
        <span class="org-confidence org-confidence--${org.confidence}">${CONFIDENCE_LABEL[org.confidence]}</span>
        ${assumptions ? `<span class="org-assumed">${assumptions} assumed detail${assumptions === 1 ? '' : 's'}</span>` : ''}
      </span>
    </button>`;
}

/** Open the picker. `onPick` receives the chosen org id; the dialog closes itself first. */
export function showOrgPicker(onPick: (id: string) => void): void {
  const existing = document.querySelector('.org-picker');
  if (existing) existing.remove();

  const root = document.createElement('div');
  root.className = 'org-picker';
  root.innerHTML = `
    <div class="dialog-backdrop"></div>
    <div class="dialog badgy-card" role="dialog" aria-modal="true" aria-labelledby="org-picker-title">
      <header class="dialog-head">
        <h2 class="dialog-title" id="org-picker-title">Choose your workplace</h2>
        <button class="badgy-button badgy-button--icon org-picker-close" aria-label="Close">✕</button>
      </header>
      <p class="setting-help">Each workplace sets a starting policy, holidays and usual week. You can
        change any of it later in Settings — nothing here is locked.</p>
      <div class="org-grid">${ORGS.map(card).join('')}</div>
      <p class="setting-help">Missing your employer, or is one of these out of date?
        <a class="signin-link" href="https://github.com/kypflug/badgy/tree/main/data" target="_blank"
          rel="noreferrer noopener">Open a pull request</a> — the policies are plain JSON.</p>
    </div>`;

  const close = (): void => {
    document.removeEventListener('keydown', onKeydown);
    root.remove();
  };
  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') close();
  }

  root.querySelector('.dialog-backdrop')?.addEventListener('click', close);
  root.querySelector('.org-picker-close')?.addEventListener('click', close);
  document.addEventListener('keydown', onKeydown);
  for (const button of root.querySelectorAll<HTMLButtonElement>('.org-card')) {
    button.addEventListener('click', () => {
      const id = button.dataset.org;
      close();
      if (id) onPick(id);
    });
  }
  document.body.appendChild(root);
}
