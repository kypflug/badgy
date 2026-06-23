import type { MeResponse } from '@rto/shared';
import type { Context, MiddlewareHandler } from 'hono';

export interface Principal {
  id: string;
  name: string | null;
  email: string | null;
}

export type AuthEnv = { Variables: { principal: Principal } };

const PRINCIPAL_HEADER = 'x-ms-client-principal';
const OID_CLAIMS = [
  'http://schemas.microsoft.com/identity/claims/objectidentifier',
  'oid',
  'sub',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier',
];
const NAME_CLAIMS = ['name', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'];
const EMAIL_CLAIMS = [
  'preferred_username',
  'email',
  'emails',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
];

interface EasyAuthPrincipal {
  claims?: { typ: string; val: string }[];
  userId?: string;
  userDetails?: string;
}

/**
 * Identify the caller from App Service Easy Auth's `X-MS-CLIENT-PRINCIPAL` header.
 * Falls back to a dev shim (env `DEV_USER`) so local end-to-end works without AAD.
 */
export function parsePrincipal(c: Context): Principal | null {
  const header = c.req.header(PRINCIPAL_HEADER);
  if (header) {
    try {
      const decoded = JSON.parse(
        Buffer.from(header, 'base64').toString('utf8'),
      ) as EasyAuthPrincipal;
      const claims = decoded.claims ?? [];
      const pick = (types: string[]): string | null =>
        claims.find((cl) => types.includes(cl.typ))?.val ?? null;
      const id = pick(OID_CLAIMS) ?? decoded.userId ?? null;
      if (id) {
        return {
          id,
          name: pick(NAME_CLAIMS),
          email: pick(EMAIL_CLAIMS) ?? decoded.userDetails ?? null,
        };
      }
    } catch {
      // malformed header → treat as unauthenticated
    }
  }
  const dev = process.env.DEV_USER;
  if (dev) return { id: `dev:${dev}`, name: dev, email: dev };
  return null;
}

export function toMe(principal: Principal | null): MeResponse {
  return principal
    ? { authenticated: true, id: principal.id, name: principal.name, email: principal.email }
    : { authenticated: false, id: null, name: null, email: null };
}

/**
 * Optional allowlist gate. When `ALLOWED_EMAIL_DOMAINS` is set (comma-separated),
 * only those email domains are admitted — e.g. `microsoft.com`. When unset, any
 * identity the platform authenticated is allowed (the IdP/tenant already gates).
 */
export function emailAllowed(email: string | null): boolean {
  const allow = (process.env.ALLOWED_EMAIL_DOMAINS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) return true;
  const domain = (email ?? '').split('@')[1]?.toLowerCase() ?? '';
  return allow.includes(domain);
}

export const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const principal = parsePrincipal(c);
  if (!principal) return c.json({ error: 'unauthenticated' }, 401);
  if (!emailAllowed(principal.email)) return c.json({ error: 'forbidden' }, 403);
  c.set('principal', principal);
  await next();
};
