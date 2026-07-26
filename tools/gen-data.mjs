#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const orgDir = path.join(dataDir, 'orgs');
const holidayDir = path.join(dataDir, 'holidays');
const outDir = path.join(root, 'packages', 'shared', 'src', 'generated');
const outFile = path.join(outDir, 'data.ts');

const pointer = (pathParts) =>
  `/${pathParts.map((part) => String(part).replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`;

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function validate(schema, value, file, pathParts = []) {
  const errors = [];
  const fail = (message) => errors.push(`${file} ${pointer(pathParts)}: ${message}`);

  if (schema.oneOf) {
    const matches = schema.oneOf.filter(
      (candidate) => validate(candidate, value, file, pathParts).length === 0,
    );
    if (matches.length !== 1) fail(`must match exactly one schema, matched ${matches.length}`);
    return errors;
  }

  if (schema.const !== undefined && value !== schema.const)
    fail(`must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) fail(`must be one of ${schema.enum.join(', ')}`);

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    const ok = types.some((type) =>
      type === 'integer' ? typeof value === 'number' && Number.isInteger(value) : actual === type,
    );
    if (!ok) return [`${file} ${pointer(pathParts)}: must be ${types.join(' or ')}`];
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum)
      fail(`must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum)
      fail(`must be <= ${schema.maximum}`);
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      fail(`must be at least ${schema.minLength} characters`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      fail(`must match ${schema.pattern}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      fail(`must have at least ${schema.minItems} items`);
    if (schema.items) {
      for (const [index, item] of value.entries()) {
        errors.push(...validate(schema.items, item, file, [...pathParts, index]));
      }
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push(`${file} ${pointer([...pathParts, key])}: is required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties))
          errors.push(`${file} ${pointer([...pathParts, key])}: unknown property`);
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (key in value)
        errors.push(...validate(childSchema, value[key], file, [...pathParts, key]));
    }
  }

  return errors;
}

async function readData(dir) {
  const files = (await readdir(dir)).filter((file) => file.endsWith('.json')).sort();
  return Promise.all(
    files.map(async (file) => ({
      file,
      stem: file.slice(0, -5),
      path: path.join(dir, file),
      value: await readJson(path.join(dir, file)),
    })),
  );
}

const [orgSchema, holidaySchema, orgFiles, holidayFiles] = await Promise.all([
  readJson(path.join(dataDir, 'schema', 'org.schema.json')),
  readJson(path.join(dataDir, 'schema', 'holiday-set.schema.json')),
  readData(orgDir),
  readData(holidayDir),
]);

const errors = [];
for (const item of orgFiles) errors.push(...validate(orgSchema, item.value, item.path));
for (const item of holidayFiles) errors.push(...validate(holidaySchema, item.value, item.path));

const holidayIds = new Set();
for (const item of holidayFiles) {
  if (item.value.id !== item.stem) errors.push(`${item.path} /id: must equal filename stem`);
  if (holidayIds.has(item.value.id)) errors.push(`${item.path} /id: duplicate holiday id`);
  holidayIds.add(item.value.id);
}

const orgIds = new Set();
const aliases = new Map();
for (const item of orgFiles) {
  const org = item.value;
  if (org.id !== item.stem) errors.push(`${item.path} /id: must equal filename stem`);
  if (orgIds.has(org.id)) errors.push(`${item.path} /id: duplicate org id`);
  orgIds.add(org.id);
  if (!holidayIds.has(org.holidaySet))
    errors.push(`${item.path} /holidaySet: unknown holiday set "${org.holidaySet}"`);
  for (const alias of org.aliases ?? []) {
    const existing = aliases.get(alias);
    if (existing)
      errors.push(`${item.path} /aliases: alias "${alias}" already used by ${existing}`);
    aliases.set(alias, org.id);
  }
}
for (const [alias, owner] of aliases) {
  if (orgIds.has(alias))
    errors.push(`data/orgs/${owner}.json /aliases: alias "${alias}" collides with an org id`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const holidayOrder = ['us-microsoft', 'us-federal', 'ca', 'uk', 'ie', 'au', 'de', 'fr', 'in'];
const holidaySets = holidayFiles
  .map((item) => item.value)
  .sort((a, b) => {
    const ai = holidayOrder.indexOf(a.id);
    const bi = holidayOrder.indexOf(b.id);
    if (ai !== -1 || bi !== -1)
      return (ai === -1 ? holidayOrder.length : ai) - (bi === -1 ? holidayOrder.length : bi);
    return a.label.localeCompare(b.label);
  });
const orgs = orgFiles.map((item) => item.value);
const literal = (value) => JSON.stringify(value, null, 2);
const source = `// Generated by tools/gen-data.mjs from data/. Do not edit by hand.\nimport type { HolidaySet } from '../holidays.js';\nimport type { OrgPreset } from '../policy/types.js';\n\nexport const HOLIDAY_SETS = ${literal(holidaySets)} as const satisfies readonly HolidaySet[];\n\nexport const ORG_PRESETS = ${literal(orgs)} as const satisfies readonly OrgPreset[];\n`;

await mkdir(outDir, { recursive: true });
await writeFile(outFile, source.replace(/\r\n/g, '\n'));

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['biome', 'check', '--write', '--vcs-use-ignore-file=false', 'packages/shared/src/generated'],
  {
    cwd: root,
    stdio: 'inherit',
  },
);
if (result.status) process.exit(result.status);
