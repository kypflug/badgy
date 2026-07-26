# Badgy

An elegant, installable **attendance calendar** for planning office time against a rolling
**badge-in compliance** score, with **preconfigured return-to-office policies** for a dozen large
employers. Plan and record office / remote / time-off across dates, drag-select ranges, set your
"usual week", and see at a glance whether you're on track.

Badgy is built around the conventions Microsoft employees will recognise — the **BELT** score
(Best Eight of Last Twelve) is one of the bundled policies — but it ships **preconfigured
return-to-office policies for a dozen large employers**, and every input is configurable in
Settings, so any organisation with an RTO target can use it.

**Live:** https://badgy.tech · pick your workplace at `badgy.tech/amazon`, `badgy.tech/google`,
`badgy.tech/microsoft`, and so on.

## How it works

- **Sign in with Microsoft or Google.** Your data is saved **privately to your own cloud storage**
  — a hidden per-app folder in OneDrive or Google Drive — synced across devices with conflict-free
  **CRDT** merge. A small token-mediating backend keeps the refresh token encrypted server-side;
  attendance data still flows directly between your browser and Microsoft Graph or Google Drive.
- **Pick your workplace.** Arriving at `badgy.tech/<employer>` preconfigures the compliance scheme,
  holidays and usual week for that employer. Presets only ever *seed* defaults — everything stays
  editable, and you can switch workplace at any time.
- **Calendar-first.** Use the detailed month view for day-to-day tracking or the compact yearly
  planner for annual office/time-off planning and status totals. Click a day to set its status;
  **drag-select** a range to bulk-assign (e.g. a vacation week). Past = actual (solid), future =
  forecast (outlined), with a clear *today* line.
- **Date and range notes.** Add a required label and accent color from a date menu or drag-range
  toolbar. Notes can span weeks, months, and years; click a label to edit or delete it. They sync
  with the calendar but never change statuses or your score. Overlaps with other notes or Meetup
  weeks use multicolor dashed outlines while retaining every label.
- **"Usual week" pattern** auto-fills future weekdays (e.g. Tue/Thu remote); specific days override it.
- **Headline compliance** ring ("are you on track?") with actual-to-date + projected score, plus an
  integrated what-if planner ("aim for ~N office days/week to hold 80%").
- **Installable PWA** (offline shell, Window Controls Overlay, follows the system theme).

## Workplace policies

Badgy models six distinct measurement shapes, so a preset can express how an employer actually
counts attendance rather than forcing everything into one formula:

| Scheme | Shape | Example |
|---|---|---|
| `best-of-window` | Mean of the best N of the last M weeks ÷ a full week | Microsoft (BELT) |
| `qualifying-weeks` | N weeks of the last M that hit a daily minimum | BELT, read as pass/fail |
| `weekly-quota` | N days a week, optionally rolling-averaged | Google, Apple, Meta, IBM, Amazon, Dell |
| `period-quota` | N office days per month or quarter | Salesforce (10 a quarter) |
| `period-percentage` | A share of the working days in a period | percentage-based mandates |
| `none` | No requirement at all | NVIDIA |

Each preset also declares how **time off, sickness, holidays and business travel** are treated —
whether they reduce what a period asks of you, or simply score zero.

Presets ship with a **confidence level** (`official`, `reported`, `community`), their **sources**,
and an explicit list of **assumptions**. Most employers never publish their measurement window, so
Badgy shows you which numbers are sourced and which are inferred rather than implying certainty.

Bundled: Microsoft, Microsoft AI, Google, Amazon, Meta, Apple, NVIDIA, Salesforce, Dell, IBM,
JPMorgan Chase, plus a neutral generic default.

## Contributing a policy or holiday set

Policies and holiday sets are **plain JSON** in [`data/`](data/) — no TypeScript required. If your
employer is missing or a policy is out of date, open a pull request. See
[`data/README.md`](data/README.md) for the schema, sourcing rules and validation, and
[`CONTRIBUTING.md`](CONTRIBUTING.md) for setup.

## Make it yours

Everything the score depends on lives in **Settings**:

| Setting | What it does |
|---|---|
| **Workplace policy** | Scheme, its parameters, and how time off is treated. Seeded by your employer preset; always editable. |
| **Your usual week** | Per-weekday default status; any specific date overrides it. |
| **Target** | Drives the "on track?" ring and the what-if planner. |
| **Meetup weeks** | Weeks highlighted for planning context. They never affect your score. |
| **Holidays** | Pick a set, then add or remove individual days, or import an `.ics`. |

Bundled holiday sets are generated from rules (fixed dates, nth-weekday, Easter offsets and
weekend-observance shifts), so any year resolves without a yearly data refresh:
**United States — Microsoft**, **United States — federal**, Canada, United Kingdom, Ireland,
Australia, Germany, France and India. Anything a set misses can be imported from an `.ics`
export (Google, Outlook or Apple Calendar) or added by hand.

## Statuses

In office · Remote · Business Travel · Time off (DTO) · Sick · Holiday · Other. By default only
**In office** counts toward your score; a policy may also credit **Business Travel**.

## Stack

TypeScript monorepo (npm workspaces):

| Package | What | Tech |
|---|---|---|
| `packages/shared` | Types, the policy engine, calendar, holidays, planner, and the **CRDT sync core** | TypeScript, vitest |
| `packages/web` | Calendar SPA, offline cache, direct Graph/Drive sync, and PWA | Lit + esbuild |
| `packages/api` | Multi-provider auth transaction/session BFF; never handles attendance data | Azure Functions, MSAL Node, Azure Tables |
| `data/` | Community-contributable org policies and holiday rule sets | JSON + JSON Schema |

Tooling: Biome, stylelint, Playwright, Node 24. Hosting: **Azure Static Web Apps** with managed
Functions.

## BELT

Badgy's original scheme, and still Microsoft's preset. Office Days/week = Sunday–Saturday resolved
`In office`, capped at 5. **BELT** = average of the 8 largest weekly Office-Day counts over the
trailing 12 weeks, ÷5. Bands: `<80%` red · `80–90%` amber · `≥90%` green. The numeric core lives in
`packages/shared/src/belt.ts` and is pinned by parity tests against an independently written
oracle; the generic policy engine is held to that same fixture.

## Develop

```bash
nvm use            # Node 24
npm install
npm run dev        # http://localhost:5173 — dev mode uses a mock "remote" (no sign-in needed)
npm run gates      # lint + lint:css + typecheck + build + test

MSAL_CLIENT_ID=<app-client-id> npm run dev   # web-only production-mode build
```

## Deploy

Static build → **Azure Static Web Apps**. See [`docs/SETUP.md`](docs/SETUP.md) (app registration +
`swa deploy`). Icons are generated by `packages/web/scripts/gen-icons.mjs`.

## Showcase thumbnails

Badgy is listed on [stuntcamp](https://stuntcamp.app), which screenshots each app automatically.
A signed-out visitor only ever sees the sign-in card, so the listing images are generated here
instead — the real app, rendered against a seeded sample document over the dev mock transport:

```bash
npm run dev                  # one shell
npm run thumbs -- ./out      # another; writes badgy.jpg + badgy-dark.jpg at 1280x800
```

## License

[MIT](LICENSE).
