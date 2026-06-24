# Hybrid Attendance Modeler (badgy)

An elegant single‑page web app for planning office attendance against **badge‑in (RTO) compliance**,
using the **BELT** rolling score (Best Eight of Last Twelve). A web port of the Excel
*Hybrid Attendance Modeler*, with a forward‑looking planning helper. Styled with the **MAI design system**.

**Live:** https://ashy-desert-004fdfe1e.7.azurestaticapps.net

## How your data is stored

Sign in with your **Microsoft account**. Your data is saved **privately to your own OneDrive**
(a hidden per‑app folder), synced across your devices with conflict‑free merge. The app is **100%
client‑side** — there's no server and **no operator‑held data**; even the app owner can't see yours.

## Stack

TypeScript monorepo (npm workspaces):

| Package | What | Tech |
|---|---|---|
| `packages/shared` | Types, BELT calc, planner, and the **CRDT sync core** | TypeScript, vitest |
| `packages/web` | The single‑page app (UI + auth + sync) | Lit + esbuild, MSAL, Microsoft Graph |

Tooling: Biome (lint/format), stylelint, Playwright, Node 24. Hosting: **Azure Static Web Apps** (free, no cold start).

## BELT score (matches the source spreadsheet exactly)

- **Office Days** for a week = Mon–Fri marked `Office` **or** `Planned`.
- **BELT** = average of the **8 largest** weekly Office‑Day counts over the **trailing 12 weeks**,
  ÷5 (→ % of a 5‑day week). First score appears at the **13th** tracked week.
- Bands: `< 80%` red · `80–90%` amber · `≥ 90%` green.

See `packages/shared/src/belt.ts` (+ parity tests against the Excel's own values).

## Multi‑device sync (how the merge works)

Edits are stored as a sparse **last‑write‑wins map** of overrides, each stamped with a **hybrid
logical clock** (robust to device clock skew). `merge()` is a commutative, idempotent CRDT, so two
devices that both edit offline converge to the same state. The engine pulls → merges → writes the
OneDrive file with **eTag** optimistic concurrency (retry on conflict); localStorage is the offline
cache. See `packages/shared/src/sync/` and `packages/web/src/sync/`.

## Develop

```bash
nvm use            # Node 24
npm install
npm run dev        # http://localhost:5173 — dev mode uses a mock "remote" (no sign-in needed)
npm run gates      # lint + lint:css + typecheck + build + test

# To exercise real OneDrive sign-in locally (needs the registered client id):
MSAL_CLIENT_ID=<app-client-id> npm run dev
```

## Deploy

Static build → **Azure Static Web Apps**. Build with the MSAL client id, then `swa deploy`.
Full runbook (app registration + deploy + custom domain): [`docs/SETUP.md`](docs/SETUP.md).

## Provenance

Ported from `Hybrid Attendance Modeler Template (2026).xlsx`. Meetup‑week highlights track the Edge
Cycle calendar (`chatgpm/cycles.yaml`).
