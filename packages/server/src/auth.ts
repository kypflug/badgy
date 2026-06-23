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
 * Optional allowlist gate. Admit an identity when:
 *  - neither `ALLOWED_EMAILS` nor `ALLOWED_EMAIL_DOMAINS` is set (the IdP/tenant gates), or
 *  - the email exactly matches `ALLOWED_EMAILS` (comma-separated), or
 *  - the email's domain matches `ALLOWED_EMAIL_DOMAINS` (comma-separated, e.g. microsoft.com).
 */
export function emailAllowed(email: string | null): boolean {
  const list = (v: string | undefined): string[] =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  const emails = list(process.env.ALLOWED_EMAILS);
  const domains = list(process.env.ALLOWED_EMAIL_DOMAINS);
  if (emails.length === 0 && domains.length === 0) return true;
  const addr = (email ?? '').toLowerCase();
  const domain = addr.split('@')[1] ?? '';
  return emails.includes(addr) || domains.includes(domain);
}

export const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const principal = parsePrincipal(c);
  if (!principal) return c.json({ error: 'unauthenticated' }, 401);
  if (!emailAllowed(principal.email)) return c.json({ error: 'forbidden' }, 403);
  c.set('principal', principal);
  await next();
};
