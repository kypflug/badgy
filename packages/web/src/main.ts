import './styles/app.css';
import { SHARED_VERSION } from '@rto/shared';

// Scaffold bootstrap — real Lit components (app shell, tracker, dashboard, planner) land in P2.
const root = document.querySelector('rto-app');
if (root) {
  const el = document.createElement('div');
  el.style.padding = '24px';
  el.textContent = `RTO Dashboard — scaffold OK (shared v${SHARED_VERSION})`;
  root.appendChild(el);
}
