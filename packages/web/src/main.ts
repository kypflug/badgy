import './styles/app.css';
import { initAuth, signIn, signOut } from './auth/msal.js';
import { setSession } from './auth/session.js';
import { CONFIG } from './config.js';
import { applyMode, getMode } from './lib/theme.js';
import { store } from './state/store.js';
import { graphTransport } from './sync/graph.js';
import { mockTransport } from './sync/mock.js';

applyMode(getMode());

function renderSignIn(): void {
  const host = document.querySelector('rto-app');
  if (!host) return;
  host.innerHTML = '';
  const screen = document.createElement('div');
  screen.className = 'signin-screen';
  screen.innerHTML = `
    <div class="signin-card mai-card">
      <div class="brand-mark" aria-hidden="true"></div>
      <h1 class="signin-title">Hybrid Attendance Modeler</h1>
      <p class="signin-sub">Plan your office time against your rolling BELT score. Your data is saved
        privately to your own OneDrive — only you can see it.</p>
      <button class="mai-button mai-button--primary signin-button" type="button">
        Sign in with Microsoft
      </button>
      <p class="signin-fine">Uses your Microsoft account and a private app folder in your OneDrive.</p>
    </div>`;
  screen.querySelector('button')?.addEventListener('click', () => void signIn());
  host.appendChild(screen);
}

async function boot(): Promise<void> {
  if (CONFIG.clientId.length > 0) {
    const account = await initAuth();
    if (!account) {
      renderSignIn();
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
}

await boot();
