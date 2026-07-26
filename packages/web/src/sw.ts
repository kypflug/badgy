/// <reference lib="webworker" />
const sw = self as unknown as ServiceWorkerGlobalScope;
const VERSION = 'badgy-v11';
const SHELL = [
  '/',
  '/index.html',
  '/main.js',
  '/main.css',
  '/favicon.svg',
  '/icon-192.png',
  '/manifest.webmanifest',
];

sw.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

// Stale-while-revalidate for same-origin GETs: serve the cached shell/assets
// instantly, then refresh the cache in the background for the next load.
sw.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // Never intercept the BFF — the SW must not turn /api/auth/login (a 302) into the SPA shell.
  if (url.pathname.startsWith('/api/')) return;
  const key = req.mode === 'navigate' ? '/index.html' : req;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(key);
      const network = fetch(req)
        .then((res) => {
          if (res?.status === 200) void cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached ?? Response.error());
      return cached ?? network;
    }),
  );
});
