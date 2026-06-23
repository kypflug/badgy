import type { AppData } from '@rto/shared';
import type { Hono } from 'hono';
import { z } from 'zod';
import { type AuthEnv, parsePrincipal, requireAuth, toMe } from './auth.js';
import type { UserStore } from './store.js';

const status = z.enum(['Office', 'Planned', 'Remote', 'DTO', 'Holiday', 'Sick', 'Travel']);
const weekDays = z.object({
  mon: status,
  tue: status,
  wed: status,
  thu: status,
  fri: status,
});
const week = z.object({ weekStart: z.string(), days: weekDays, meetup: z.boolean() });
const yearData = z.object({ year: z.number().int(), weeks: z.array(week) });
const appDataSchema = z.object({
  years: z.record(z.string(), yearData),
  settings: z.object({ activeYear: z.number().int(), targetBelt: z.number().min(0).max(1) }),
});

/** Register the REST API onto an existing Hono app. */
export function registerApi(app: Hono<AuthEnv>, store: UserStore): void {
  app.get('/api/health', (c) => c.json({ ok: true, store: store.kind }));

  app.get('/api/me', (c) => c.json(toMe(parsePrincipal(c))));

  app.use('/api/data', requireAuth);

  app.get('/api/data', async (c) => c.json(await store.get(c.get('principal').id)));

  app.put('/api/data', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = appDataSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    }
    await store.put(c.get('principal').id, parsed.data as AppData);
    return c.body(null, 204);
  });
}
