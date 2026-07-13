import type { HttpRequest } from '@azure/functions';

/**
 * Canonical public origin. SWA forwards the *internal* function host in x-forwarded-host, so we
 * can't derive the public domain from headers — use APP_BASE_URL (e.g. https://badgy.tech), with
 * a request-derived fallback only for local `swa start`.
 */
export function baseUrl(req: HttpRequest): string {
  const configured = process.env.APP_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  const proto = req.headers.get('x-forwarded-proto') ?? 'http';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:4280';
  return `${proto}://${host}`;
}

export function isSecure(req: HttpRequest): boolean {
  return baseUrl(req).startsWith('https');
}

export function redirectUri(req: HttpRequest): string {
  return `${baseUrl(req)}/api/auth/callback`;
}

/** Allow same-registrable-domain origins (apex + www) and localhost; reject cross-site. */
export function allowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname;
    return host === 'badgy.tech' || host.endsWith('.badgy.tech') || host === 'localhost';
  } catch {
    return false;
  }
}

/** Require browser API posts to originate from the exact public application origin. */
export function isSameOrigin(req: HttpRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(baseUrl(req)).origin;
  } catch {
    return false;
  }
}

export function isBadgyRequest(req: HttpRequest): boolean {
  return req.headers.get('x-requested-with') === 'badgy' && isSameOrigin(req);
}
