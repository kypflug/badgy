import './styles/app.css';
import { applyTheme, getTheme } from './lib/theme.js';
import { ApiPersistence, LocalPersistence, type Persistence } from './state/persistence.js';
import { probeSession } from './state/session.js';
import { store } from './state/store.js';

applyTheme(getTheme());

const session = await probeSession();
const persistence: Persistence = session.me?.authenticated
  ? new ApiPersistence()
  : new LocalPersistence();

await store.init(persistence);
await import('./components/rto-app.js');
