# Agent guide — badgy (Hybrid Attendance Modeler)

A **client‑only** single‑page web app port of Kyle's Excel RTO/badge‑in planner. Sign‑in is
**MSAL** (Microsoft accounts); each user's data lives **privately in their own OneDrive app folder**
via Microsoft Graph, synced across devices with a **CRDT**. No backend, no operator‑held data.

## First actions

1. `nvm use` (Node 24) then `npm install`.
2. `@rto/shared` builds before `web` typecheck (web imports its types).
3. Validate with `npm run gates` (lint + lint:css + typecheck + build + test).

## Layout

- `packages/shared` — **source of truth**: types, the **BELT** calc, planner, and the **CRDT sync
  core** (`src/sync/`: `hlc.ts` hybrid logical clock, `doc.ts` LWW map + `merge` + `materialize`).
  Pure + heavily unit‑tested.
- `packages/web` — Lit + esbuild SPA.
  - `auth/` — MSAL public client (`msal.ts`) + the current `session`.
  - `sync/` — `graph.ts` (OneDrive app‑folder transport, eTag concurrency), `types.ts`, `mock.ts`
    (dev "remote" so the app runs before registration).
  - `state/store.ts` — the **sync engine**: optimistic local edits → debounced pull/merge/push;
    materializes the doc into the view model. localStorage = offline cache only.
  - `components/`, `lib/`, `styles/` — UI (token‑driven MAI CSS), formatting, theme.

## Conventions (mirror Kyle's `theseus` repo)

- TypeScript, ESM, `verbatimModuleSyntax` (use `import type`). Lit for UI, zod where validating,
  Biome (lint/format), stylelint (CSS), Playwright + vitest, Node 24.
- Style **only** with MAI tokens (`var(--smtc-…)`); large squircle radii; calm/spacious; the AI
  blue→cyan→green gradient is reserved for AI/hero accents (not the primary button).

## BELT — don't change without updating tests

`officeDays` = Mon–Fri ∈ {Office, Planned}. `BELT(i)` for `i ≥ 12`:
`average(top 8 of officeDays over weeks [i-11..i]) / 5`. Bands 80/90. The first tracked week never
enters a window (matches the Excel). Pinned by parity tests vs the spreadsheet's own values.

## Sync invariants — don't break

`merge` must stay commutative + idempotent; every write gets a fresh HLC stamp (`hlc.tick()`);
the doc holds only **overrides** (defaults come from `materialize`). Pinned by tests in
`packages/shared/src/sync/sync.test.ts`.

## Deploy

`MSAL_CLIENT_ID=<id> npm run build` then deploy `packages/web/dist` to **Azure Static Web Apps**
(`swa deploy`). The MSAL app registration is a public client (PKCE, no secret), MSA + work/school,
with SPA redirect URIs for the SWA host + `http://localhost:5173`. See `docs/SETUP.md`.
