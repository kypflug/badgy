import './styles/app.css';
import { applyTheme, getTheme } from './lib/theme.js';
import { ApiPersistence, LocalPersistence, type Persistence } from './state/persistence.js';
import { store } from './state/store.js';

applyTheme(getTheme());

/** Use the server when signed in (served behind Easy Auth); otherwise browser-local. */
async function choosePersistence(): Promise<Persistence> {
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      const me = (await res.json()) as { authenticated?: boolean };
      if (me?.authenticated) return new ApiPersistence();
    }
  } catch {
    // no API reachable → fall back to local
  }
  return new LocalPersistence();
}

await store.init(await choosePersistence());
await import('./components/rto-app.js');
