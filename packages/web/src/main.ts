import './styles/app.css';
import {
  type AuthAccount,
  type InteractiveAuthFlow,
  initAuth,
  signIn,
  signOut,
  switchAccount,
} from './auth/msal.js';
import { setSession } from './auth/session.js';
import { CONFIG } from './config.js';
import { applyMode, getMode } from './lib/theme.js';
import { store } from './state/store.js';
import { graphTransport } from './sync/graph.js';
import { mockTransport } from './sync/mock.js';

applyMode(getMode());

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
  if (code === 'error' || code === 'fail') return 'Microsoft sign-in did not complete. Try again.';
  return 'Sign-in could not be completed.';
}

function bindFlow(screen: HTMLElement, flow: InteractiveAuthFlow): void {
  const primary = screen.querySelector<HTMLButtonElement>('.signin-button');
  const alternate = screen.querySelector<HTMLButtonElement>('.signin-switch-button');
  const open = screen.querySelector<HTMLButtonElement>('.signin-open-button');
  const status = screen.querySelector<HTMLElement>('.signin-status');

  const update = (): void => {
    const snapshot = flow.snapshot;
    const busy =
      snapshot.stage === 'starting' || snapshot.stage === 'waiting' || snapshot.stage === 'blocked';
    if (primary) primary.disabled = busy;
    if (alternate) alternate.disabled = busy;
    if (open) open.hidden = snapshot.stage !== 'blocked';
    if (!status) return;
    if (snapshot.stage === 'starting') status.textContent = 'Preparing Microsoft sign-in…';
    else if (snapshot.stage === 'waiting')
      status.textContent = 'Finish signing in with Microsoft, then return to Badgy.';
    else if (snapshot.stage === 'blocked')
      status.textContent = 'Safari blocked the sign-in window. Open it to continue.';
    else if (snapshot.stage === 'failed')
      status.textContent =
        snapshot.error === 'auth_expired'
          ? 'The sign-in timed out. Try again.'
          : 'Sign-in could not be completed. Try again.';
  };

  flow.addEventListener('change', update);
  if (open)
    open.onclick = () => {
      flow.openMicrosoft();
      update();
    };
  update();
  void flow.completion
    .then(() => window.location.replace('/'))
    .catch(() => {
      if (primary) primary.disabled = false;
      if (alternate) alternate.disabled = false;
    });
}

function renderSignIn(reason: string | null = null): void {
  const host = document.querySelector('rto-app');
  if (!host) return;
  host.innerHTML = '';
  const screen = document.createElement('div');
  screen.className = 'signin-screen';
  screen.innerHTML = `
    <div class="signin-card mai-card">
      <div class="brand-mark" aria-hidden="true"></div>
      <h1 class="signin-title">Badgy</h1>
      <p class="signin-sub">Plan your office time against your rolling BELT score. Your data is saved
        privately to your own OneDrive — only you can see it.</p>
      <button class="mai-button mai-button--primary signin-button" type="button">
        Sign in with Microsoft
      </button>
      <button class="mai-button signin-switch-button" type="button">Use another account</button>
      <button class="mai-button signin-open-button" type="button" hidden>
        Open Microsoft sign-in
      </button>
      <p class="signin-status" role="status">${reason ?? legacyAuthError() ?? ''}</p>
      <p class="signin-fine">Use your <strong>personal</strong> Microsoft account (outlook.com, hotmail, live) — <strong>not</strong> a work or school account. Your data stays in your own OneDrive.</p>
    </div>`;
  screen
    .querySelector('.signin-button')
    ?.addEventListener('click', () => bindFlow(screen, signIn()));
  screen
    .querySelector('.signin-switch-button')
    ?.addEventListener('click', () => bindFlow(screen, switchAccount()));
  host.appendChild(screen);
}

function renderUnavailable(): void {
  const host = document.querySelector('rto-app');
  if (!host) return;
  host.innerHTML = `
    <div class="signin-screen">
      <div class="signin-card mai-card">
        <div class="brand-mark" aria-hidden="true"></div>
        <h1 class="signin-title">Badgy is temporarily unavailable</h1>
        <p class="signin-sub">Your session could not be checked. This is usually a network or
          service issue, not a reason to sign in again.</p>
        <button class="mai-button mai-button--primary signin-button" type="button">Retry</button>
      </div>
    </div>`;
  host.querySelector('button')?.addEventListener('click', () => window.location.reload());
}

async function startApp(account: AuthAccount): Promise<void> {
  setSession({
    name: account.name,
    email: account.email,
    id: account.id,
    signOut,
  });
  await store.start(graphTransport, `badgy:doc:${account.id}`);
  await import('./components/rto-app.js');
  const host = document.querySelector('rto-app') as
    | (HTMLElement & {
        updateComplete?: Promise<unknown>;
      })
    | null;
  await host?.updateComplete;
}

async function boot(): Promise<void> {
  // Ask the browser to keep our storage (MSAL token cache + offline doc) — reduces the
  // eviction that makes iOS/Safari forget the sign-in between launches.
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
      signOut: async () => {
        location.reload();
        return true;
      },
    });
    await store.start(mockTransport, 'badgy:doc:dev');
    await import('./components/rto-app.js');
    const host = document.querySelector('rto-app') as
      | (HTMLElement & {
          updateComplete?: Promise<unknown>;
        })
      | null;
    await host?.updateComplete;
  }
  hideSplash();
}

await boot();
