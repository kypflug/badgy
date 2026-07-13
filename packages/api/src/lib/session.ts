import type { Cookie, HttpRequest } from '@azure/functions';
import { decrypt, encrypt } from './crypto';

const SESSION_COOKIE = 'badgy_session';
const OAUTH_COOKIE = 'badgy_oauth';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days (Safari may cap to 7 days of inactivity)
const OAUTH_MAX_AGE = 600;

export interface SessionData {
  uid: string;
  name: string;
  email: string;
}
export interface OAuthState {
  state: string;
  verifier: string;
}

export type SessionReadResult =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'valid'; session: SessionData };

function sessionKey(): string {
  const k = process.env.SESSION_KEY;
  if (!k) throw new Error('SESSION_KEY not configured');
  return k;
}

export function parseCookies(req: HttpRequest): Record<string, string> {
  const header = req.headers.get('cookie') ?? '';
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function readSession(req: HttpRequest): SessionData | null {
  const result = readSessionResult(req);
  return result.status === 'valid' ? result.session : null;
}

function validSession(value: unknown): value is SessionData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SessionData>;
  return (
    typeof candidate.uid === 'string' &&
    candidate.uid.length > 0 &&
    typeof candidate.name === 'string' &&
    typeof candidate.email === 'string'
  );
}

export function readSessionResult(req: HttpRequest): SessionReadResult {
  const raw = parseCookies(req)[SESSION_COOKIE];
  if (!raw) return { status: 'missing' };
  try {
    const parsed: unknown = JSON.parse(decrypt(raw, sessionKey()));
    return validSession(parsed) ? { status: 'valid', session: parsed } : { status: 'invalid' };
  } catch {
    return { status: 'invalid' };
  }
}

export function readOAuth(req: HttpRequest): OAuthState | null {
  const raw = parseCookies(req)[OAUTH_COOKIE];
  if (!raw) return null;
  try {
    return JSON.parse(decrypt(raw, sessionKey())) as OAuthState;
  } catch {
    return null;
  }
}

export function sessionCookie(data: SessionData, secure: boolean): Cookie {
  const expires = new Date(Date.now() + SESSION_MAX_AGE * 1000);
  return {
    name: SESSION_COOKIE,
    value: encrypt(JSON.stringify(data), sessionKey()),
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    expires,
  };
}

export function oauthCookie(state: OAuthState, secure: boolean): Cookie {
  const expires = new Date(Date.now() + OAUTH_MAX_AGE * 1000);
  return {
    name: OAUTH_COOKIE,
    value: encrypt(JSON.stringify(state), sessionKey()),
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    maxAge: OAUTH_MAX_AGE,
    expires,
  };
}

export function clearCookie(name: string, secure: boolean): Cookie {
  return {
    name,
    value: '',
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  };
}

export { OAUTH_COOKIE, SESSION_COOKIE };
