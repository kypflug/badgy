import { createHash } from 'node:crypto';
import type { HttpRequest } from '@azure/functions';

interface RateLimitEntry {
  count: number;
  windowStartedAt: number;
}

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  maxKeys: number;
}

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  constructor(private readonly options: RateLimiterOptions) {}

  allow(key: string, now = Date.now()): boolean {
    const existing = this.entries.get(key);
    if (!existing || now - existing.windowStartedAt >= this.options.windowMs) {
      if (!existing && this.entries.size >= this.options.maxKeys) this.evictOldest();
      this.entries.set(key, { count: 1, windowStartedAt: now });
      return true;
    }
    if (existing.count >= this.options.limit) return false;
    existing.count += 1;
    return true;
  }

  get size(): number {
    return this.entries.size;
  }

  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldest = Number.POSITIVE_INFINITY;
    for (const [key, entry] of this.entries) {
      if (entry.windowStartedAt < oldest) {
        oldest = entry.windowStartedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) this.entries.delete(oldestKey);
  }
}

export function forwardedClientKey(req: HttpRequest): string {
  const forwarded =
    req.headers.get('x-azure-clientip') ??
    req.headers.get('x-forwarded-for')?.split(',', 1)[0]?.trim() ??
    'unknown';
  return createHash('sha256').update(forwarded).digest('base64url');
}
