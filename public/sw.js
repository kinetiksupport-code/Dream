// Dream service worker.
// Policy: only public static files enter CacheStorage — the offline page, the
// icons and the immutable, content-hashed build assets under /_next/static/.
// Never cached: navigations (HTML), auth, /api, dream-api, Supabase, uploads
// or anything with credentials. Updates wait for the user ("Actualizar").
const VERSION = 'v3';
const STATIC_CACHE = `dream-static-${VERSION}`;
const ASSET_CACHE = `dream-static-${VERSION}-assets`;
const STATIC = ['/offline.html', '/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];
const MAX_ASSETS = 150;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC)));
  // No automatic activation: an open chat or exam keeps the version it started with.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('dream-static-') && key !== STATIC_CACHE && key !== ASSET_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((key) => cache.delete(key)));
}

async function immutableAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    await cache.put(request, response.clone());
    void trim(cache);
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.open(STATIC_CACHE).then((cache) => cache.match('/offline.html'))),
    );
    return;
  }
  if (request.headers.has('authorization')) return;
  if (url.pathname.startsWith('/_next/static/') && !url.search) {
    event.respondWith(immutableAsset(request));
    return;
  }
  if (STATIC.includes(url.pathname) && !url.search) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) => cache.match(url.pathname)).then((cached) => cached || fetch(request)),
    );
  }
});
