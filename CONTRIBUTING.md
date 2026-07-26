# Contributing to Badgy

Thanks for helping improve Badgy.

## Setup

```bash
nvm use
npm install
npm run gates
```

`packages/api` has its own dependency tree; install and test it only when changing API files.

## Style

- Keep LF line endings.
- Use Biome formatting: single quotes, 2-space indent and organized imports.
- Run `npx biome check --write <paths>` for files you touch.
- Commit subjects should be short and imperative, such as `Add date and range notes`.

## Policy and holiday data

Organisation RTO presets and holiday sets are JSON under `data/`. Start with `data/README.md`; it
explains schemas, sourcing rules, assumptions and validation. Do not edit
`packages/shared/src/generated/` by hand — run `npm run gen:data`.
