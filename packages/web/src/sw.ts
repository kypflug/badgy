/// <reference lib="webworker" />
const sw = self as unknown as ServiceWorkerGlobalScope;
const VERSION = 'badgy-v2-1';
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
      .then((c) => c.addAll(SHELL))
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

sw.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('/index.html').then((r) => r ?? Response.error())),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        void caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      });
    }),
  );
});
