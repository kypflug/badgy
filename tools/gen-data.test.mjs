import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validate, validateComplianceSchemeContract } from './gen-data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}

describe('gen-data validation', () => {
  it('rejects best-of-window presets whose best count exceeds the window', async () => {
    const preset = await readJson('data/orgs/microsoft.json');
    preset.scheme.bestCount = 20;

    expect(validateComplianceSchemeContract(preset.scheme, 'data/orgs/microsoft.json')).toEqual([
      'data/orgs/microsoft.json /scheme/bestCount: must be <= windowWeeks (12), got 20',
    ]);
  });

  it('rejects prototype-shaped keys as unknown own preset properties', async () => {
    const schema = await readJson('data/schema/org.schema.json');
    const presetWithProto = await readJson('data/orgs/microsoft.json');
    Object.defineProperty(presetWithProto, '__proto__', {
      value: 'bad',
      enumerable: true,
      configurable: true,
    });
    const presetWithToString = { ...(await readJson('data/orgs/microsoft.json')), toString: 'bad' };

    expect(validate(schema, presetWithProto, 'data/orgs/microsoft.json')).toContain(
      'data/orgs/microsoft.json /__proto__: unknown property',
    );
    expect(validate(schema, presetWithToString, 'data/orgs/microsoft.json')).toContain(
      'data/orgs/microsoft.json /toString: unknown property',
    );
  });

  it('does not accept required properties from the prototype chain', () => {
    const schema = {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
      },
    };
    expect(validate(schema, Object.create({ id: 'inherited' }), 'preset.json')).toEqual([
      'preset.json /id: is required',
    ]);
  });

  it('accepts a valid preset', async () => {
    const schema = await readJson('data/schema/org.schema.json');
    const preset = await readJson('data/orgs/microsoft.json');

    expect(validate(schema, preset, 'data/orgs/microsoft.json')).toEqual([]);
    expect(validateComplianceSchemeContract(preset.scheme, 'data/orgs/microsoft.json')).toEqual([]);
  });
});
