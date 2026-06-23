import './styles/app.css';
import { applyTheme, getTheme } from './lib/theme.js';
import { store } from './state/store.js';

applyTheme(getTheme());
await store.init();
await import('./components/rto-app.js');
