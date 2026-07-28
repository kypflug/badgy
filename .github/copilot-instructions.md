# Copilot instructions — Badgy

Badgy is an installable attendance **calendar** for planning office time against a
**return-to-office policy**, with preconfigured policies for a dozen large employers. Each user's
data lives **privately in a hidden per-app folder in their own cloud storage** — OneDrive via
Microsoft Graph, or Google Drive's `appDataFolder` — reached directly from the browser and merged
with a **CRDT**. `packages/api` mediates Microsoft and Google auth only — **attendance data must
never pass through it**.

`CLAUDE.md` is a condensed version of this guide; keep the two in sync when conventions change.

## Setup and commands

```bash
nvm use                    # Node 24 (.nvmrc)
npm install                # root workspaces: packages/shared + packages/web
npm run gates              # gen:data + lint + lint:css + typecheck + build + test — the full local gate
npm run gen:data           # compile data/*.json → packages/shared/src/generated/ (gitignored)
npm run dev                # http://localhost:5173, mock "remote", no sign-in required
MSAL_CLIENT_ID=<id> npm run dev   # production-mode web build (real BFF auth)
```

`npm run gen:data` also **validates** every JSON file in `data/` against its schema, so a bad
community contribution fails the gate with the offending file and JSON Pointer. It runs
automatically via `pretypecheck` / `prebuild:shared` / `pretest` hooks — you rarely invoke it
directly.

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

Three packages plus a data directory, one hard boundary:

| Package | Role |
|---|---|
| `data/` | **Community-contributable JSON**: `orgs/*.json` employer policy presets, `holidays/*.json` rule sets, `schema/*.json` JSON Schema. Compiled into shared by `tools/gen-data.mjs`. `data/README.md` is the contributor guide. |
| `packages/shared` | Source of truth for the domain: `types.ts` (taxonomy), the policy engine (`policy/types.ts`, `policy/engine.ts`, `policy/planner.ts`, `policy/registry.ts`), `belt.ts` (pinned numeric core), `calendar.ts` (UTC/ISO date helpers + meetup registry), `holidays.ts` (rule engine), and the CRDT core in `sync/hlc.ts` + `sync/doc.ts`. Heavily unit-tested. |
| `packages/web` | Lit + esbuild SPA/PWA. `state/store.ts` is the sync engine and the only calendar API the components use; `sync/graph.ts` and `sync/google-drive.ts` talk to the storage APIs directly (`sync/mock.ts` in dev); `auth/provider.ts` drives the BFF flow; `org/resolve.ts` resolves the workplace. |
| `packages/api` | Azure Functions v4 (CommonJS, Node 20) token mediator for **both** providers: PKCE transactions, HttpOnly session cookie, short-lived access tokens. Encrypted token caches + transactions in Azure Table Storage. |

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
| `cfg\|org` | the employer preset id the user entered under |
| `cfg\|scheme` | a JSON `ComplianceScheme` when the user has customized the rule |

- `merge` must stay **commutative and idempotent** (HLC compare, then a JSON tie-break); every write
  gets a fresh `hlc.tick()`, and remote stamps are fed through `hlc.observe()` on pull.
- There is no delete: "clearing" a day writes its *default* value, and notes write `null`.
- Unset days resolve in this order: explicit `d|` override → holiday → `pat|` weekday pattern →
  unconfigured weekend `none` → `office` (`resolveDay` in `sync/doc.ts`).
- `migrate()` upgrades legacy v1 weekly-grid docs; it runs on every cache load and every pull. The
  `cfg|org` and `cfg|scheme` keys are purely additive and need no migration.
- **Org presets seed, they never lock.** `store.seedOrgDefaults()` writes `cfg|org` only after the
  first successful pull proves the cell is unset — seeding on a failed or offline first sync would
  let whichever URL a returning user opened silently overwrite the workplace they already chose.

### Sync engine (`packages/web/src/state/store.ts`)

Edits mutate the local doc, save to localStorage (offline cache, keyed
`badgy:doc:<provider>:<accountId>`), re-render optimistically, and debounce a
`pull → merge → push` (800 ms), with a 30 s poll plus focus/visibility triggers. Pushes use the
transport's concurrency token as `if-match` and retry up to 4 times on `conflict`. Undo/redo stores
reversible patches and replays them with **fresh** stamps so they win LWW and sync. Two distinct
failure states: `needsReconnect` (the `AUTH_INTERACTION_REQUIRED` sentinel from `auth/provider.ts` —
prompt re-auth, keep cached data) versus `isSyncUnavailable` (transient, retry silently).

`SyncTransport.etag` is an **opaque per-transport token**: a real HTTP ETag on Graph, and Drive's
`version` field on Google. Drive v3 removed ETags and ignores `If-Match`, so `google-drive.ts`
re-reads `version` immediately before writing and reports `'conflict'` if it moved. That is weaker
than Graph's conditional write and is only safe because the doc is a CRDT and every client keeps a
local copy — a write that loses the race is merged and re-pushed on the next sync.

### Auth flow

`POST /api/auth/start` takes a `provider` (`microsoft` | `google`), creates a server-side PKCE
transaction and returns an authorization URL plus a one-time polling secret. The provider may
complete in a different browser context; `/api/auth/callback` marks the transaction complete, and
the original app's poll of `POST /api/auth/complete` is what sets the HttpOnly session cookie in the
right cookie jar (this is the Safari/iOS fix — don't "simplify" it back to a cookie-bound callback).
`/api/token` mints short-lived access tokens, cached client-side until ~1 minute before expiry, and
`/api/auth/me` reports the provider so the client picks the matching storage transport. Browser
POSTs must carry `x-requested-with: badgy` and an exact same-origin `Origin` (`isBadgyRequest`).
Never log tokens, cookies, polling secrets, refresh tokens or personal data.

Provider notes: sessions and Table Storage rows are namespaced by provider (Microsoft keeps its
legacy un-prefixed key so existing sessions survive); a session with **no** `provider` is treated as
Microsoft. Google's authorization request always sends `prompt=consent` because Google issues a
refresh token only on first consent — without it, every returning Google user would fail with
`invalid_grant`.

### Policy engine

Six scheme kinds, all normalising to a `0..1` attainment ratio plus a period series, so the ring,
sparkline, bands and planner stay scheme-agnostic:

| Kind | Shape |
|---|---|
| `best-of-window` | mean of the best N of the last M weeks ÷ a full week (BELT) |
| `qualifying-weeks` | N of the last M weeks that hit a daily minimum |
| `weekly-quota` | N days a week, optionally rolling-averaged (`daysPerWeek: 5` = full mandate) |
| `period-quota` | N office days per month or quarter |
| `period-percentage` | a share of the working days in a fixed period |
| `none` | no requirement; always scores 1 |

Every scheme carries `bands` and an `absence` policy: which statuses are `excused`,
`travelCountsAsOffice`, and `proration` (`prorate` scales a period's requirement down by the days
actually scheduled; `ignore` leaves it alone — BELT uses `ignore` because its best-N window *is* the
time-off allowance).

Presets in `data/orgs/` declare `confidence` (`official` / `reported` / `community`), `sources[]`
and `assumptions[]`. Most employers never publish their measurement window, so **never present a
guess as fact**: any inferred parameter belongs in `assumptions[]`, and Settings surfaces it.

### BELT

Badgy's original scheme, and Microsoft's preset. Sunday–Saturday weeks; count resolved `office`
days, cap each week at 5; score = mean of the 8 largest counts in the trailing 12 weeks ÷ 5; bands
`<80%` danger, `80–90%` warning, `≥90%` success. Past = actual, future = forecast, split at
`todayISO()`. `belt.ts` is the pure number-series core and is pinned by a parity fixture
(`src/__fixtures__/belt-parity.json`); `policy/engine.test.ts` asserts the generic engine reproduces
it exactly. **If they disagree, the engine is wrong — never the fixture.** Treat changes there as
behavioural changes, not refactors.

### Workplace routing

`packages/web/src/org/resolve.ts` resolves, most explicit first: hostname first label → first path
segment → `?org=` → the remembered choice → `generic`. It then cleans the URL with
`history.replaceState` so the auth round-trip and the cached SW shell stay on `/`.

Path routing (`badgy.tech/amazon`) is what ships — `navigationFallback` already serves it, so adding
a preset needs **no** infrastructure change. Hostname is checked first purely so that pointing
`amazon.badgy.tech` at the app later is a DNS change and nothing else. Be aware: **Azure Static Web
Apps allows at most 5 custom domains and no wildcard**, so a sub-domain per employer does not scale
without putting Azure Front Door in front.

### Holidays

`holidays.ts` is the rule *engine*; the rule *data* lives in `data/holidays/*.json`, describing each
set as *rules* (fixed date, nth/last weekday, Easter offset, weekend observance,
`fixed-or-nth-weekday`), never date tables, so any year resolves. `us-microsoft` is the default set
and its 2026/2027 output is pinned by a parity test — don't change those rules casually. Users layer
`h|` overrides on top from Settings, including `.ics` import (`lib/import-ics.ts`).

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
  (`var(--badgy-…)`) in the global `app.css` — never hardcode a colour in a component. Warm-paper
  light and warm-charcoal dark palettes, 8–14px radii (no `corner-shape`), and a single major
  shadow on the Workbench frame only: interior separation is hairlines and value steps.
  Status bars, dots and swatches use the `s-<status>` classes produced by `lib/status.ts`.
- Adding or renaming a status means touching `STATUSES`, `STATUS_LABEL`, `STATUS_SHORT`,
  `countStatuses` (shared) and the `.s-*` rules in `app.css`. The `STATUSES`
  array *is* the UI display order.
- Compliance band classes are `.score-danger` / `.score-warning` / `.score-success` (they were
  `.belt-*` before the engine was generalised).
- Adding a scheme kind means touching `SchemeParams`, `SCHEME_KINDS`, `SCHEME_LABEL`,
  `isSchemeParams`, `defaultSchemeFor`, `schemePeriod` (shared `policy/types.ts`), the evaluator and
  `headline` in `policy/engine.ts`, `schemeFields` in `settings-policy-section.ts`,
  `schemeExplainer` in `help-dialog.ts`, and the `scheme` `oneOf` in
  `data/schema/org.schema.json`.
- Dates are UTC ISO `YYYY-MM-DD` strings end to end; use the helpers in `calendar.ts` rather than
  `Date` arithmetic. Weeks always start on Sunday.
- Formatting/linting is Biome (single quotes, 100 columns, 2 spaces, organize-imports on) plus
  stylelint for CSS. Comment only what needs clarification.
- Commit subjects are short and imperative ("Add date and range notes", "Fix rapid month scrolling").

## Gotchas

- `sw.ts` must never intercept `/api/` (it would turn a BFF redirect into the SPA shell). Bump
  `VERSION` when the cached shell changes — and remember the SW will happily serve a stale bundle
  during local testing, so unregister it when a dev-mode change seems not to apply.
- Default meetup weeks are a hardcoded per-year registry in `calendar.ts` (`MEETUP_WEEKS`); new
  years need an entry, and users can toggle weeks on top of it.
- `packages/shared/src/generated/` is **generated and gitignored**. A fresh clone must run
  `npm run gen:data` before a bare `npx vitest`; the npm `pre*` hooks handle every normal path.
- `MSAL_CLIENT_ID` is public and is set in `.github/workflows/deploy.yml`; `MSAL_CLIENT_SECRET`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_KEY`, `TOKEN_ENC_KEY` and
  `STORAGE_CONNECTION` live only in Static Web App settings (see `docs/SETUP.md`).
- Google's `drive.appdata` is a **sensitive scope**: an unverified app is capped at 100 test users,
  so Google verification is a launch prerequisite, not a code task. Until then the sign-in button is
  hidden by the `GOOGLE_ENABLED` build flag (`signInProviders()` in `auth/provider.ts`, default
  off). The flag gates **only the sign-in choice** — an existing Google session still resolves its
  provider, transport and metadata normally, so don't "simplify" it into the session path.
- Deploys happen on push to `main` via `.github/workflows/deploy.yml` (builds shared + web, then
  `packages/api` with its own lockfile, and uploads both to Azure Static Web Apps).
