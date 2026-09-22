/**
 * CARE Workflow service worker.
 *
 * Deliberately small. Work data is live and permission-scoped, so nothing
 * from the API is cached here, and pages always come from the network so a
 * deploy is visible on the next load. The worker makes the app installable
 * and shows a proper offline page instead of the browser's error screen.
 *
 * Bump VERSION whenever offline.html or its assets change.
 */
const VERSION = 'v1';
const CACHE = `care-shell-${VERSION}`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      // Starts the page request while the worker boots, so it adds no latency.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        return preloaded || (await fetch(event.request));
      } catch {
        return (await caches.match(OFFLINE_URL)) || Response.error();
      }
    })(),
  );
});
