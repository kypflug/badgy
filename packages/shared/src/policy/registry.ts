import { ORG_PRESETS } from '../generated/data.js';
import type { OrgPreset } from './types.js';

export const DEFAULT_ORG_ID = 'generic';

export const ORGS: readonly OrgPreset[] = [...ORG_PRESETS].sort((a, b) => {
  if (a.id === DEFAULT_ORG_ID) return -1;
  if (b.id === DEFAULT_ORG_ID) return 1;
  return a.label.localeCompare(b.label);
});

const ORG_BY_ID = new Map<string, OrgPreset>();
for (const org of ORGS) {
  ORG_BY_ID.set(org.id.toLowerCase(), org);
  for (const alias of org.aliases ?? []) ORG_BY_ID.set(alias.toLowerCase(), org);
}

function defaultOrg(): OrgPreset {
  const org = ORG_BY_ID.get(DEFAULT_ORG_ID);
  if (!org) throw new Error(`Missing default org preset "${DEFAULT_ORG_ID}"`);
  return org;
}

const DEFAULT_ORG = defaultOrg();

export function findOrg(id: string): OrgPreset | null {
  return ORG_BY_ID.get(id.toLowerCase()) ?? null;
}

export function isOrgId(value: unknown): value is string {
  return typeof value === 'string' && findOrg(value) !== null;
}

export function orgOrDefault(id: string | null | undefined): OrgPreset {
  return id ? (findOrg(id) ?? DEFAULT_ORG) : DEFAULT_ORG;
}
