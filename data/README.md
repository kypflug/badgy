# Badgy data

Badgy keeps community-contributable organisation policy presets and holiday rule sets in this
`data/` directory. The TypeScript module under `packages/shared/src/generated/` is generated from
these files, is gitignored, and must not be edited by hand.

## Organisation presets

A preset describes one employer's return-to-office policy in a shape Badgy can evaluate. The `id`
must match the filename stem (`data/orgs/acme.json` has `"id": "acme"`). Every preset needs at least
one source URL and every modelling guess must be listed in `assumptions[]`.

JSON does not allow comments, but this is the anatomy of a complete file:

```json
{
  "id": "acme",
  "label": "Acme Corp",
  "aliases": ["acme-corp"],
  "summary": "3 days a week, measured each week",
  "scheme": {
    "kind": "weekly-quota",
    "daysPerWeek": 3,
    "averagingWeeks": 1,
    "bands": { "warn": 0.8, "success": 0.9 },
    "absence": {
      "excused": ["vacation", "sick", "holiday", "oof"],
      "travelCountsAsOffice": false,
      "proration": "prorate"
    }
  },
  "target": 1,
  "holidaySet": "us-federal",
  "confidence": "reported",
  "assumptions": ["Partial-vacation-week treatment is not documented."],
  "sources": [{ "label": "Company blog", "url": "https://example.com/policy" }],
  "effectiveDate": "2026-01-01",
  "geographicScope": "Within 50 miles of an office",
  "notes": "Optional extra detail for the picker."
}
```

### Scheme kinds

- `best-of-window`: Microsoft BELT-style mean of the best `bestCount` weekly counts in the last
  `windowWeeks`, with each week capped at `weeklyCap`.
- `qualifying-weeks`: each week qualifies after `daysPerWeek`; the window passes after
  `minQualifying` qualifying weeks.
- `weekly-quota`: fixed `daysPerWeek`, optionally smoothed across `averagingWeeks`; `anchorDays`
  are display-only named weekdays.
- `period-quota`: an absolute number of `days` in a calendar `month` or `quarter`.
- `period-percentage`: a `percent` share of working days in a calendar `month` or `quarter`.
- `none`: remote-first or no office-day requirement. The engine treats it as fully attained.

### Absence and proration

`absence.excused` lists statuses that are approved non-office days. `travelCountsAsOffice` should be
`true` only when the source says business travel is credited as office attendance. `proration` is
`ignore` when the target stays fixed despite leave, and `prorate` when approved leave reduces the
working-day pool.

### Sourcing rules

Use the strongest confidence the sources support: `official` for company-published policy,
`reported` for reputable press or worker communications, and `community` for neutral examples or
unsourced defaults. Never present a guess as fact. Every assumed parameter goes in `assumptions[]`,
and every preset must have at least one live `http(s)` source URL.

## Holiday sets

Holiday sets live in `data/holidays/*.json`. They contain `{ "id", "label", "note"?, "rules" }`.
Rules are declarative (`fixed`, `nth-weekday`, `last-weekday`, `weekday-on-or-before`, `easter`,
`relative`, or `fixed-or-nth-weekday`) so dates can resolve for any year. Add a new set only when it
is a defensible regional or employer-specific variant; otherwise point the org preset at an existing
set such as `us-federal`.

## Validate locally

Run:

```bash
npm run gen:data
npm test
```

`npm run gen:data` validates both schemas and cross-file invariants before regenerating the ignored
TypeScript output.
