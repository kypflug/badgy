import { serve } from '@hono/node-server';
import { SHARED_VERSION } from '@rto/shared';
import { Hono } from 'hono';

const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true, shared: SHARED_VERSION }));

// Real routes (/api/me, /api/data) + Easy Auth principal + Table Storage land in P3.
// In production this server also serves the built web SPA from packages/web/dist.

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`rto-server listening on :${info.port}`);
});
