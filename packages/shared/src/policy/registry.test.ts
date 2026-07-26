import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HOLIDAY_REGIONS, holidaysForYear, isHolidayRegionId } from '../holidays.js';
import { findOrg, ORGS } from './registry.js';
import { isComplianceScheme } from './types.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const orgDir = path.join(repoRoot, 'data', 'orgs');

describe('org policy registry', () => {
  it('resolves every org and validates its scheme', () => {
    for (const org of ORGS) {
      expect(findOrg(org.id), org.id).toBe(org);
      expect(isComplianceScheme(org.scheme), org.id).toBe(true);
      for (const alias of org.aliases ?? []) expect(findOrg(alias), alias).toBe(org);
    }
  });

  it('keeps ids unique, filename-backed and alias-safe', () => {
    const filenames = new Set(readdirSync(orgDir).map((file) => file.replace(/\.json$/, '')));
    const ids = new Set<string>();
    const aliases = new Set<string>();
    for (const org of ORGS) {
      expect(filenames.has(org.id), org.id).toBe(true);
      expect(ids.has(org.id), org.id).toBe(false);
      ids.add(org.id);
      for (const alias of org.aliases ?? []) {
        expect(ids.has(alias), alias).toBe(false);
        expect(aliases.has(alias), alias).toBe(false);
        aliases.add(alias);
      }
    }
    for (const alias of aliases) expect(ids.has(alias), alias).toBe(false);
  });

  it('points every org at a known holiday set and live-looking source URL', () => {
    for (const org of ORGS) {
      expect(isHolidayRegionId(org.holidaySet), org.id).toBe(true);
      expect(org.sources.length, org.id).toBeGreaterThan(0);
      expect(
        org.sources.some((source) => /^https?:\/\//.test(source.url)),
        org.id,
      ).toBe(true);
    }
  });

  it('records assumptions for non-official presets', () => {
    for (const org of ORGS) {
      if (org.confidence === 'official') continue;
      expect(org.assumptions?.length ?? 0, org.id).toBeGreaterThan(0);
    }
  });
});

describe('generated holiday sets', () => {
  it('resolve without duplicate dates for 2026 through 2030', () => {
    for (const region of HOLIDAY_REGIONS) {
      for (let year = 2026; year <= 2030; year++) {
        const holidays = holidaysForYear(region.id, year);
        expect(holidays.length, `${region.id} ${year}`).toBeGreaterThan(0);
        expect(new Set(holidays.map((holiday) => holiday.date)).size, `${region.id} ${year}`).toBe(
          holidays.length,
        );
      }
    }
  });
});
