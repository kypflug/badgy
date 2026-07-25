import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initAuth, startInteractiveAuth } from './msal.js';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('auth startup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('treats 401 as signed out without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'no_session' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(initAuth()).resolves.toEqual({ status: 'signed-out', reason: 'no_session' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries service failures instead of turning them into sign-in', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'storage_unavailable' }, 503))
      .mockResolvedValueOnce(jsonResponse({ error: 'storage_unavailable' }, 503))
      .mockResolvedValueOnce(
        jsonResponse({ signedIn: true, id: 'u1', name: 'Ada', email: 'k@example.com' }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = initAuth();
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({
      status: 'signed-in',
      account: { id: 'u1', name: 'Ada', email: 'k@example.com' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps temporary auth outages distinct from signed out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = initAuth();
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({ status: 'unavailable' });
  });
});

describe('interactive auth transaction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('deduplicates starts and completes through polling', async () => {
    const popup = {
      closed: false,
      close: vi.fn(),
      document: { title: '', body: { textContent: '' } },
      location: { replace: vi.fn() },
    };
    vi.stubGlobal('window', {
      open: vi.fn(() => popup),
      location: { assign: vi.fn() },
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            transactionId: 'tx',
            pollSecret: 'secret',
            authorizationUrl: 'https://login.example/authorize',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            status: 'complete',
            account: { id: 'u1', name: 'Ada', email: 'k@example.com' },
          }),
        ),
    );

    const first = startInteractiveAuth();
    const second = startInteractiveAuth();
    expect(second).toBe(first);
    await vi.runAllTimersAsync();
    await expect(first.completion).resolves.toEqual({
      id: 'u1',
      name: 'Ada',
      email: 'k@example.com',
    });
    expect(popup.location.replace).toHaveBeenCalledWith('https://login.example/authorize');
    expect(popup.close).toHaveBeenCalled();
  });
});
