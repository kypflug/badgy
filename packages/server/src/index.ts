import 'dotenv/config';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { registerApi } from './api.js';
import type { AuthEnv } from './auth.js';
import { createStore } from './store.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function resolveWebDist(): string | null {
  const candidates = [
    process.env.WEB_DIST,
    join(process.cwd(), 'web'),
    join(process.cwd(), '../web/dist'),
    join(process.cwd(), 'public'),
  ].filter((p): p is string => Boolean(p));
  const found = candidates.find((p) => existsSync(join(p, 'index.html')));
  return found ? resolve(found) : null;
}

const store = await createStore();
const app = new Hono<AuthEnv>();
registerApi(app, store);

const webRoot = resolveWebDist();
if (webRoot) {
  // Serve the built SPA (static assets + index.html fallback for client routes).
  app.get('*', async (c) => {
    if (c.req.path.startsWith('/api/')) return c.json({ error: 'not found' }, 404);
    const rel = normalize(decodeURIComponent(new URL(c.req.url).pathname)).replace(
      /^(\.\.(\/|\\|$))+/,
      '',
    );
    let file = join(webRoot, rel);
    if (!file.startsWith(webRoot)) return c.text('forbidden', 403);
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    } catch {
      file = join(webRoot, 'index.html'); // SPA fallback
    }
    try {
      const body = await readFile(file);
      return c.body(body, 200, {
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      });
    } catch {
      return c.text('not found', 404);
    }
  });
}

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`rto-server on :${info.port} · store=${store.kind} · web=${webRoot ?? 'none'}`);
});
