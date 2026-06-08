// FACE Prep PWA service worker. Network-first for fresh data/HTML,
// cache fallback for offline. Bump CACHE on each release to clear old assets.
const CACHE = 'faceprep-v1';
const SHELL = ['/', '/login', '/manifest.json', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // never cache writes
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return;           // always hit network for data/auth
  // network-first, fall back to cache (offline)
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('/')))
  );
});
