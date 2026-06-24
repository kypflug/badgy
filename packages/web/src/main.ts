import './styles/app.css';
import { initAuth, signIn, signOut } from './auth/msal.js';
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

function renderSignIn(): void {
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
      <p class="signin-fine">Use your <strong>personal</strong> Microsoft account (outlook.com, hotmail, live) — <strong>not</strong> a work or school account. Your data stays in your own OneDrive.</p>
    </div>`;
  screen.querySelector('button')?.addEventListener('click', () => void signIn());
  host.appendChild(screen);
}

async function boot(): Promise<void> {
  if (CONFIG.clientId.length > 0) {
    const account = await initAuth();
    if (!account) {
      renderSignIn();
      hideSplash();
      return;
    }
    setSession({
      name: account.name ?? account.username,
      email: account.username,
      id: account.homeAccountId,
      signOut: () => void signOut(),
    });
    await store.start(graphTransport, `badgy:doc:${account.homeAccountId}`);
  } else {
    // Local dev: no app registration yet → in-memory "remote".
    setSession({
      name: 'Dev (local)',
      email: 'dev@local',
      id: 'dev',
      signOut: () => location.reload(),
    });
    await store.start(mockTransport, 'badgy:doc:dev');
  }
  await import('./components/rto-app.js');
  const host = document.querySelector('rto-app') as
    | (HTMLElement & {
        updateComplete?: Promise<unknown>;
      })
    | null;
  await host?.updateComplete;
  hideSplash();
}

await boot();
