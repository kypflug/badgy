/** Theme: Light / Dark / System (follows the OS live). Persisted in localStorage. */
export type ThemeMode = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

const KEY = 'badgy:theme';
let media: MediaQueryList | null = null;

export function getMode(): ThemeMode {
  const s = localStorage.getItem(KEY);
  return s === 'light' || s === 'dark' || s === 'system' ? s : 'system';
}

function resolve(mode: ThemeMode): Theme {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

export function currentTheme(): Theme {
  return resolve(getMode());
}

function updateThemeColor(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  const color = getComputedStyle(document.documentElement)
    .getPropertyValue('--badgy-surface-page')
    .trim();
  meta.content = color || (theme === 'dark' ? '#1f2431' : '#ffffff');
}

export function applyMode(mode: ThemeMode): void {
  localStorage.setItem(KEY, mode);
  updateThemeColor(resolve(mode));
  if (mode === 'system' && !media) {
    media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', () => {
      if (getMode() === 'system') updateThemeColor(resolve('system'));
    });
  }
}
