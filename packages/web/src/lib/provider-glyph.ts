/** Provider marks for the sign-in card. Inline so we ship no third-party brand CSS or assets. */
import type { ProviderId } from '../auth/provider.js';

const MICROSOFT = `<svg viewBox="0 0 20 20" width="18" height="18" focusable="false">
  <rect x="1" y="1" width="8" height="8" fill="#f25022" />
  <rect x="11" y="1" width="8" height="8" fill="#7fba00" />
  <rect x="1" y="11" width="8" height="8" fill="#00a4ef" />
  <rect x="11" y="11" width="8" height="8" fill="#ffb900" />
</svg>`;

const GOOGLE = `<svg viewBox="0 0 48 48" width="18" height="18" focusable="false">
  <path fill="#4285f4" d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.3h12.1c-.2 2-1.6 5-4.5 7l6.9 5.4c4.1-3.8 6.6-9.4 6.6-15.7z" />
  <path fill="#34a853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-7.1 5.5C8.1 41.1 15.4 46 24 46z" />
  <path fill="#fbbc05" d="M11.5 28.4c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4l-7.1-5.5C2.9 17 2 20.4 2 24s.9 7 2.4 9.9l7.1-5.5z" />
  <path fill="#ea4335" d="M24 10.5c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 4.4 29.9 2 24 2 15.4 2 8.1 6.9 4.4 14.1l7.1 5.5c1.8-5.3 6.7-9.1 12.5-9.1z" />
</svg>`;

export const PROVIDER_GLYPH: Record<ProviderId, string> = {
  microsoft: MICROSOFT,
  google: GOOGLE,
};
