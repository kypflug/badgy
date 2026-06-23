# Hybrid Attendance Modeler (RTO / BELT planner)

An elegant single-page web app for planning office attendance against **badge-in (RTO) compliance**,
using the **BELT** rolling score (Best Eight of Last Twelve). A web port of the Excel
*Hybrid Attendance Modeler* — multi-user, AAD-gated to Microsoft employees, with private per-user
persistence and a forward-looking planning helper. Styled with the **MAI design system**.

**Live:** https://badgy-kp8532.azurewebsites.net (Azure App Service + Table Storage; sign-in enabled).

## Stack

TypeScript monorepo (npm workspaces):

| Package | What | Tech |
|---|---|---|
| `packages/shared` | Canonical types + BELT calculation + seed data | TypeScript, vitest |
| `packages/web` | Single-page app (UI) | Lit + esbuild, MAI tokens |
| `packages/server` | REST API + serves the SPA in prod | Hono, @azure/data-tables, zod |

Tooling: Biome (lint/format), stylelint (CSS), Playwright (visual/a11y/e2e), Node 24.

## BELT score (matches the source spreadsheet exactly)

- **Office Days** for a week = number of Mon–Fri marked `Office` **or** `Planned`.
- **BELT** = average of the **8 largest** weekly Office-Day counts over the **trailing 12 weeks**,
  divided by 5 (→ % of a 5-day week). First score appears at the **13th** tracked week.
- Color bands: `< 80%` red · `80–90%` amber · `≥ 90%` green.

See `packages/shared/src/belt.ts` for the canonical implementation + tests.

## Develop

```bash
nvm use            # Node 24
npm install
npm run dev        # API on :8080 (also serves built web in prod)
npm run dev:web    # web dev server on :5173
npm run gates      # lint + lint:css + typecheck + build + test
```

## Deploy

**Live now** at `https://badgy-kp8532.azurewebsites.net` — Azure **App Service** (Free F1, Linux Node)
serving the SPA + API, backed by **Azure Table Storage**, with **Easy Auth** (Microsoft Entra) sign-in.

Current state (deployed to the Pay-As-You-Go subscription, resource group `rg-badgy`, `westus2`):

- Public page loads anonymously (local-only mode); **data is gated** to specific accounts via
  `ALLOWED_EMAILS` (currently Kyle's accounts). Sign in from the header.
- **To open it to all Microsoft employees:** register the auth app in the Microsoft corporate tenant
  (single-tenant) and set `ALLOWED_EMAIL_DOMAINS=microsoft.com` — one documented step in
  [`docs/SETUP.md`](docs/SETUP.md) (Option B). The Bicep, packaging, CI workflow, and full runbook
  all live there.

Re-deploy after changes: `bash scripts/package-app.sh && az webapp deploy -g rg-badgy -n badgy-kp8532 --src-path dist-deploy.zip --type zip`.

## Provenance

Ported from `Hybrid Attendance Modeler Template (2026).xlsx`. Meetup-week highlights track the Edge
Cycle calendar (`chatgpm/cycles.yaml`).
