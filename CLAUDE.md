# Agent guide — rto-dashboard

Single-page web app port of Kyle's **Hybrid Attendance Modeler** (Excel) for RTO/badge-in planning.
MAI-styled, AAD-gated to Microsoft employees, private per-user persistence, plus a what-if planner.

## First actions

1. `nvm use` (Node 24) then `npm install`.
2. Build order matters: `@rto/shared` must build before `web`/`server` typecheck (they import its types).
3. Validate with `npm run gates` (lint + lint:css + typecheck + build + test).

## Layout

- `packages/shared` — **source of truth** for types, status enum, the **BELT** calc, meetup config,
  and the generated `seed/2026.json`. Consumed by both `web` and `server`. Has vitest parity tests.
- `packages/web` — Lit + esbuild SPA. Token-driven CSS only (no hardcoded color/size); MAI tokens in
  `src/styles/mai-tokens.css`. esbuild bundles `src/main.ts` → `dist/`.
- `packages/server` — Hono API. Parses App Service Easy Auth `X-MS-CLIENT-PRINCIPAL` for user identity
  (dev shim via env). Persists to Azure Table Storage (`@azure/data-tables`); Azurite/JSON fallback for
  local dev. Serves `web/dist` in production. esbuild bundles to `dist/index.js`.
- `infra/bicep` — App Service + Storage + Easy Auth (AAD single-tenant). `docs/SETUP.md` is the runbook.

## Conventions (mirrors Kyle's `theseus` repo)

- TypeScript everywhere; ESM; `verbatimModuleSyntax` (use `import type` for types).
- **Lit** for UI, **Hono** for API, **zod** for validation, **Biome** for lint/format, **stylelint**
  for CSS, **Playwright** for visual/a11y/e2e, **vitest** for unit tests, **Bicep** for IaC.
- Style **only** with MAI tokens (`var(--smtc-…)`); large squircle radii; calm/spacious; the AI
  blue→cyan→green gradient is reserved for AI/hero accents (not the primary button).

## BELT — do not change without updating tests

`officeDays(week)` = count(Mon–Fri ∈ {Office, Planned}). `dtoDays` = count(== DTO).
`BELT(i)` defined for `i ≥ 12`: `average(top 8 of officeDays over weeks [i-11..i]) / 5`.
Bands: `<0.80` danger, `0.80–<0.90` warning, `≥0.90` success. **Faithful quirk:** the first tracked
week never enters a window (window starts at the 13th week) — matches the Excel; pinned by tests.

## Statuses (from the source `Values` sheet)

`Office, Remote, DTO, Holiday, Planned, Sick, Travel`. Only `Office` + `Planned` count as office days.
`Planned` is the default day value (enables forward planning).

## Deploy

Azure App Service + Easy Auth (single-tenant AAD) + Table Storage. App Service lives in Kyle's personal
Azure subscription; the **auth app registration must live in the Microsoft corporate tenant** to gate to
MS employees. `az` is authenticated locally for provisioning.
