/* Service worker nhẹ cho app khách Dạ Lan: cache tài nguyên tĩnh và ảnh; trang dùng mạng trước,
   trang dự phòng khi mất mạng. Không cache API để dữ liệu đơn/bill luôn mới. */
const VERSION = 'dalan-guest-v1';
const STATIC_CACHE = `${VERSION}-static`;
const IMAGE_CACHE = `${VERSION}-images`;
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL, '/icon.svg', '/manifest.webmanifest']).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }
  if (req.destination === 'image') {
    event.respondWith(cacheFirst(req, IMAGE_CACHE, 200));
    return;
  }
  if (sameOrigin && req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())));
  }
});

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
    if (maxEntries) trim(cache, maxEntries);
  }
  return response;
}

async function trim(cache, maxEntries) {
  const keys = await cache.keys();
  if (keys.length > maxEntries) await cache.delete(keys[0]);
}
