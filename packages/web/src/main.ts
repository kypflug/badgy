import './styles/app.css';
import {
  type AuthAccount,
  type InteractiveAuthFlow,
  initAuth,
  type ProviderId,
  providerMeta,
  signIn,
  signInProviders,
  signOut,
} from './auth/provider.js';
import { setSession } from './auth/session.js';
import { CONFIG } from './config.js';
import { PROVIDER_GLYPH } from './lib/provider-glyph.js';
import { applyMode, getMode } from './lib/theme.js';
import { forgetOrg, type OrgEntry, resolveOrg } from './org/resolve.js';
import { store } from './state/store.js';
import { googleDriveTransport } from './sync/google-drive.js';
import { graphTransport } from './sync/graph.js';
import { mockTransport } from './sync/mock.js';
import type { SyncTransport } from './sync/types.js';

applyMode(getMode());

const entry: OrgEntry = resolveOrg();

function hideSplash(): void {
  const splash = document.querySelector('.boot-splash');
  if (!splash) return;
  splash.classList.add('boot-splash--hide');
  setTimeout(() => splash.remove(), 240);
}

function legacyAuthError(): string | null {
  const code = new URL(location.href).searchParams.get('auth');
  if (!code) return null;
  if (code === 'invalid') return 'The sign-in returned to a different browser context. Try again.';
  if (code === 'error' || code === 'fail') return 'Sign-in did not complete. Try again.';
  return 'Sign-in could not be completed.';
}

/** The provider that signed you in also decides where the document lives. */
function transportFor(provider: ProviderId): SyncTransport {
  return provider === 'google' ? googleDriveTransport : graphTransport;
}

/**
 * Drive one provider button through a sign-in attempt. A popup blocked by Safari turns *that same
 * button* into the retry, rather than adding a second near-identical button to the card.
 */
function bindFlow(screen: HTMLElement, button: HTMLButtonElement, flow: InteractiveAuthFlow): void {
  const buttons = [...screen.querySelectorAll<HTMLButtonElement>('.provider-button')];
  const status = screen.querySelector<HTMLElement>('.signin-status');
  const label = button.querySelector<HTMLElement>('.provider-label');
  const original = label?.textContent ?? '';
  const name = flow.providerLabel;

  const update = (): void => {
    const { stage, error } = flow.snapshot;
    const busy = stage === 'starting' || stage === 'waiting';
    for (const other of buttons)
      other.disabled = other === button ? busy : busy || stage === 'blocked';
    if (label) label.textContent = stage === 'blocked' ? `Open ${name} sign-in` : original;
    button.classList.toggle('is-busy', busy);
    if (!status) return;
    if (stage === 'starting') status.textContent = `Preparing ${name} sign-in…`;
    else if (stage === 'waiting')
      status.textContent = `Finish signing in with ${name}, then return to Badgy.`;
    else if (stage === 'blocked')
      status.textContent = `Your browser blocked the ${name} window. Open it to continue.`;
    else if (stage === 'failed')
      status.textContent =
        error === 'auth_expired'
          ? 'The sign-in timed out. Try again.'
          : 'Sign-in could not be completed. Try again.';
  };

  flow.addEventListener('change', update);
  update();
  void flow.completion
    .then(() => window.location.replace('/'))
    .catch(() => {
      for (const other of buttons) other.disabled = false;
      button.classList.remove('is-busy');
    });
}

function providerButton(id: ProviderId): string {
  const meta = providerMeta(id);
  return `
      <button class="badgy-button provider-button" type="button" data-provider="${id}">
        <span class="provider-glyph" aria-hidden="true">${PROVIDER_GLYPH[id]}</span>
        <span class="provider-text">
          <span class="provider-label">Sign in with ${meta.label}</span>
          <span class="provider-storage">${meta.storage}</span>
        </span>
      </button>`;
}

function renderSignIn(reason: string | null = null): void {
  const host = document.querySelector('badgy-app');
  if (!host) return;
  host.innerHTML = '';
  const org = entry.org;
  const branded = entry.source !== 'default';
  const screen = document.createElement('div');
  screen.className = 'signin-screen';
  screen.innerHTML = `
    <div class="signin-card badgy-card">
      <div class="brand-mark" aria-hidden="true"></div>
      <h1 class="signin-title">Badgy</h1>
      ${
        branded
          ? `<p class="signin-org"><span class="signin-org-name">${org.label}</span>
        <span class="signin-org-policy">${org.summary}</span></p>`
          : ''
      }
      <p class="signin-sub">Plan your office time against your return-to-office target. Your data is
        saved privately to your own cloud storage — only you can see it.</p>
      <div class="provider-list">${signInProviders(CONFIG.googleEnabled)
        .map((p) => providerButton(p.id))
        .join('')}</div>
      <p class="signin-status" role="status">${reason ?? legacyAuthError() ?? ''}</p>
      <p class="signin-fine">
        <a class="signin-link" href="/orgs">${branded ? 'Not your workplace?' : 'Pick your workplace'}</a>
      </p>
    </div>`;
  for (const button of screen.querySelectorAll<HTMLButtonElement>('.provider-button')) {
    const provider = button.dataset.provider as ProviderId;
    button.addEventListener('click', () => bindFlow(screen, button, signIn(provider)));
  }
  screen.querySelector('.signin-link')?.addEventListener('click', (event) => {
    event.preventDefault();
    forgetOrg();
    void openOrgPicker();
  });
  host.appendChild(screen);
}

async function openOrgPicker(): Promise<void> {
  const { showOrgPicker } = await import('./org/org-picker.js');
  showOrgPicker((id) => {
    window.location.assign(`/${id}`);
  });
}

function renderUnavailable(): void {
  const host = document.querySelector('badgy-app');
  if (!host) return;
  host.innerHTML = `
    <div class="signin-screen">
      <div class="signin-card badgy-card">
        <div class="brand-mark" aria-hidden="true"></div>
        <h1 class="signin-title">Badgy is temporarily unavailable</h1>
        <p class="signin-sub">Your session could not be checked. This is usually a network or
          service issue, not a reason to sign in again.</p>
        <button class="badgy-button badgy-button--primary signin-button" type="button">Retry</button>
      </div>
    </div>`;
  host.querySelector('button')?.addEventListener('click', () => window.location.reload());
}

async function mountApp(): Promise<void> {
  await import('./components/badgy-app.js');
  const host = document.querySelector('badgy-app') as
    | (HTMLElement & { updateComplete?: Promise<unknown> })
    | null;
  await host?.updateComplete;
}

async function startApp(account: AuthAccount): Promise<void> {
  setSession({
    name: account.name,
    email: account.email,
    id: account.id,
    provider: account.provider,
    signOut,
  });
  await store.start(
    transportFor(account.provider),
    `badgy:doc:${account.provider}:${account.id}`,
    entry.org,
    account.provider === 'microsoft' ? `badgy:doc:${account.id}` : undefined,
  );
  await mountApp();
}

async function boot(): Promise<void> {
  // Ask the browser to keep our storage (offline doc cache) — reduces the eviction that makes
  // iOS/Safari forget the sign-in between launches.
  void navigator.storage?.persist?.();
  if (CONFIG.clientId.length > 0) {
    const auth = await initAuth();
    if (auth.status === 'signed-out') {
      renderSignIn();
      hideSplash();
      return;
    }
    if (auth.status === 'unavailable') {
      renderUnavailable();
      hideSplash();
      return;
    }
    await startApp(auth.account);
  } else {
    // Local dev: no app registration yet → in-memory "remote".
    setSession({
      name: 'Dev (local)',
      email: 'dev@local',
      id: 'dev',
      provider: 'microsoft',
      signOut: async () => {
        location.reload();
        return true;
      },
    });
    await store.start(mockTransport, 'badgy:doc:dev', entry.org);
    await mountApp();
  }
  hideSplash();
}

await boot();
