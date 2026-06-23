# Hybrid Attendance Modeler (RTO / BELT planner)

An elegant single-page web app for planning office attendance against **badge-in (RTO) compliance**,
using the **BELT** rolling score (Best Eight of Last Twelve). A web port of the Excel
*Hybrid Attendance Modeler* — multi-user, AAD-gated to Microsoft employees, with private per-user
persistence and a forward-looking planning helper. Styled with the **MAI design system**.

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

Azure **App Service** (Node) with **Easy Auth** (single-tenant AAD → Microsoft employees) and
**Azure Table Storage**. Infra in `infra/bicep`; see `docs/SETUP.md`.

## Provenance

Ported from `Hybrid Attendance Modeler Template (2026).xlsx`. Meetup-week highlights track the Edge
Cycle calendar (`chatgpm/cycles.yaml`).
