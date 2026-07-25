# Copilot instructions — Badgy

Badgy is an installable attendance **calendar** for planning office time against a rolling
**BELT** (Best Eight of Last Twelve) badge-in score. Each user's data lives **privately in their own
OneDrive app folder**, reached directly from the browser via Microsoft Graph and merged with a
**CRDT**. `packages/api` mediates Microsoft auth only — **attendance data must never pass through
it**.

`CLAUDE.md` is a condensed version of this guide; keep the two in sync when conventions change.

## Setup and commands

```bash
nvm use                    # Node 24 (.nvmrc)
npm install                # root workspaces: packages/shared + packages/web
npm run gates              # lint + lint:css + typecheck + build + test — the full local gate
npm run dev                # http://localhost:5173, mock "remote", no sign-in required
MSAL_CLIENT_ID=<id> npm run dev   # production-mode web build (real BFF auth)
```

`packages/api` is **not** an npm workspace — it has its own lockfile and dependency tree:

```bash
npm --prefix packages/api install
npm --prefix packages/api run build     # tsc → dist (CommonJS)
npm --prefix packages/api test          # build + node --test dist/src/test/*.test.js
```

Running a single test:

```bash
npx vitest run packages/shared/src/belt.test.ts        # one file (run from repo root)
npx vitest run -t 'rolling BELT'                       # by test name
npm run test -w @badgy/shared                          # one workspace
npm --prefix packages/api run build ; node --test --test-name-pattern 'rate limiter' packages/api/dist/src/test/auth.test.js
```

Notes:

- `@badgy/shared` must be built before `web` typechecks — `npm run typecheck` runs `tsc -b`
  (project references) first.
- All files are **LF**; `.gitattributes` forces `eol=lf` because Biome's format check fails on
  every CRLF file. Don't let an editor rewrite line endings on Windows.
- Tests run in the default node environment; there is no vitest config and no DOM shim. Keep tests
  on pure logic or on Lit templates that don't need a real document.

## Architecture

Three packages, one hard boundary:

| Package | Role |
|---|---|
| `packages/shared` | Source of truth for the domain: `types.ts` (taxonomy), `belt.ts`, `calendar.ts` (UTC/ISO date helpers + meetup registry), `holidays.ts` (rule engine), `compliance.ts`, `planner.ts`, and the CRDT core in `sync/hlc.ts` + `sync/doc.ts`. Heavily unit-tested. |
| `packages/web` | Lit + esbuild SPA/PWA. `state/store.ts` is the sync engine and the only calendar API the components use; `sync/graph.ts` talks to Graph directly (`sync/mock.ts` in dev); `auth/msal.ts` drives the BFF flow. |
| `packages/api` | Azure Functions v4 (CommonJS, Node 20) token mediator: PKCE transactions, HttpOnly session cookie, short-lived Graph tokens. Encrypted MSAL caches + transactions in Azure Table Storage. |

Everything the web app imports from shared comes through the `@badgy/shared` barrel
(`packages/shared/src/index.ts`) — not deep paths.

### Data model (don't break)

A sparse last-write-wins map of **overrides**, one cell per key, each stamped with an HLC:

| Key | Value |
|---|---|
| `d\|YYYY-MM-DD` | `Status` for a specific date |
| `pat\|<0-6>` | "usual week" default status per weekday (0 = Sunday) |
| `m\|<Sunday ISO>` | meetup-week toggle |
| `h\|YYYY-MM-DD` | boolean, or a custom holiday display name |
| `n\|<uuid>` | `CalendarNote` (`null` = tombstone) |
| `cfg\|targetBelt`, `cfg\|holidayRegion` | settings |

- `merge` must stay **commutative and idempotent** (HLC compare, then a JSON tie-break); every write
  gets a fresh `hlc.tick()`, and remote stamps are fed through `hlc.observe()` on pull.
- There is no delete: "clearing" a day writes its *default* value, and notes write `null`.
- Unset days resolve in this order: explicit `d|` override → holiday → `pat|` weekday pattern →
  unconfigured weekend `none` → `office` (`resolveDay` in `sync/doc.ts`).
- `migrate()` upgrades legacy v1 weekly-grid docs; it runs on every cache load and every pull.

### Sync engine (`packages/web/src/state/store.ts`)

Edits mutate the local doc, save to localStorage (offline cache, keyed per account), re-render
optimistically, and debounce a `pull → merge → push` (800 ms), with a 30 s poll plus focus/
visibility triggers. Pushes use the Graph `eTag` as `if-match` and retry up to 4 times on
`conflict`. Undo/redo stores reversible patches and replays them with **fresh** stamps so they win
LWW and sync. Two distinct failure states: `needsReconnect` (the `AUTH_INTERACTION_REQUIRED`
sentinel from `auth/msal.ts` — prompt re-auth, keep cached data) versus `isSyncUnavailable`
(transient, retry silently).

### Auth flow

`POST /api/auth/start` creates a server-side PKCE transaction and returns an authorization URL plus
a one-time polling secret. Microsoft may complete in a different browser context; `/api/auth/callback`
marks the transaction complete, and the original app's poll of `POST /api/auth/complete` is what
sets the HttpOnly session cookie in the right cookie jar (this is the Safari/iOS fix — don't
"simplify" it back to a cookie-bound callback). `/api/token` mints short-lived Graph tokens,
cached client-side until ~1 minute before expiry. Browser POSTs must carry `x-requested-with: badgy`
and an exact same-origin `Origin` (`isBadgyRequest`). Never log tokens, cookies, polling secrets, or
personal data.

### BELT

Sunday–Saturday weeks; count resolved `office` days, cap each week at 5; score = mean of the 8
largest counts in the trailing 12 weeks ÷ 5; bands `<80%` danger, `80–90%` warning, `≥90%` success.
Past = actual, future = forecast, split at `todayISO()`. `belt.ts` is the pure number-series core and
is pinned by a parity fixture (`src/__fixtures__/belt-parity.json`) — treat changes there as
behavioural changes, not refactors.

### Holidays

`holidays.ts` describes each region as *rules* (fixed date, nth/last weekday, Easter offset, weekend
observance), never date tables, so any year resolves. `us-microsoft` is the default region and its
2026/2027 output is pinned by a parity test — don't change those rules casually. Users layer `h|`
overrides on top from Settings, including `.ics` import (`lib/import-ics.ts`).

## Conventions

- TypeScript ESM with `verbatimModuleSyntax`: use `import type`, and `.js` extensions on relative
  imports. `packages/api` is the exception — CommonJS, extensionless relative imports.
- **Lit without decorators** (`experimentalDecorators: false`, `useDefineForClassFields: false`):
  declare `static override properties = {…}`, extend `BadgyElement` (renders into **light DOM** and
  re-renders on every store `change` event), and `customElements.define(...)` at the bottom of the
  file.
- Components read and write **only** through the `store` singleton; they never touch the doc, HLC,
  or transports directly.
- Style exclusively with Badgy tokens from `packages/web/src/styles/tokens.css`
  (`var(--badgy-…)`) in the global `app.css` — never hardcode a colour in a component. Large
  squircle radii; the brand ramp is reserved for the brand mark, focus rings and the today marker.
  Status fills use the `s-<status>` classes produced by `lib/status.ts`.
- Adding or renaming a status means touching `STATUSES`, `STATUS_LABEL`, `STATUS_SHORT`,
  `countStatuses` (shared), `STATUS_ICON` (web), and the `.s-*` rules in `app.css`. The `STATUSES`
  array *is* the UI display order.
- Dates are UTC ISO `YYYY-MM-DD` strings end to end; use the helpers in `calendar.ts` rather than
  `Date` arithmetic. Weeks always start on Sunday.
- Formatting/linting is Biome (single quotes, 100 columns, 2 spaces, organize-imports on) plus
  stylelint for CSS. Comment only what needs clarification.
- Commit subjects are short and imperative ("Add date and range notes", "Fix rapid month scrolling").

## Gotchas

- `sw.ts` must never intercept `/api/` (it would turn a BFF redirect into the SPA shell). Bump
  `VERSION` when the cached shell changes.
- Default meetup weeks are a hardcoded per-year registry in `calendar.ts` (`MEETUP_WEEKS`); new
  years need an entry, and users can toggle weeks on top of it.
- `MSAL_CLIENT_ID` is public and is set in `.github/workflows/deploy.yml`; `MSAL_CLIENT_SECRET`,
  `SESSION_KEY`, `TOKEN_ENC_KEY` and `STORAGE_CONNECTION` are secrets and live only in Static Web
  App settings (see `docs/SETUP.md`).
- Deploys happen on push to `main` via `.github/workflows/deploy.yml` (builds shared + web, then
  `packages/api` with its own lockfile, and uploads both to Azure Static Web Apps).
