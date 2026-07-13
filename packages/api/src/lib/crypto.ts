import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function isValidEncryptionKey(value: string | undefined): value is string {
  if (!value) return false;
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const unpadded = normalized.replace(/=+$/, '');
  return (
    /^[A-Za-z0-9+/]+={0,2}$/.test(normalized) &&
    Buffer.from(normalized, 'base64').length === 32 &&
    Buffer.from(normalized, 'base64').toString('base64').replace(/=+$/, '') === unpadded
  );
}

/** AES-256-GCM helpers for the session cookie and the at-rest token cache. Key is base64 (32 bytes). */
function keyBuf(keyB64: string): Buffer {
  const buf = Buffer.from(keyB64, 'base64');
  if (buf.length !== 32) throw new Error('encryption key must be 32 bytes encoded as base64');
  return buf;
}

export function encrypt(plain: string, keyB64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBuf(keyB64), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64url');
}

export function decrypt(token: string, keyB64: string): string {
  const raw = Buffer.from(token, 'base64url');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', keyBuf(keyB64), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
