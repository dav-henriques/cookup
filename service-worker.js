/**
 * service-worker.js — offline shell.
 *
 * Bump CACHE when files change; the old cache is dropped on activate.
 * All paths are relative, so this works from any GitHub Pages subdirectory.
 */

const CACHE = 'cookup-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './styles/style.css',
  './fonts/inter-latin.woff2',
  './scripts/ui.js',
  './scripts/storage.js',
  './scripts/sessions.js',
  './scripts/clock.js',
  './scripts/timer.js',
  './scripts/bpm.js',
  './scripts/tap-tempo.js',
  './scripts/water.js',
  './scripts/breaks.js',
  './components/modal.js',
  './components/toast.js',
  './components/session-card.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // One missing file should not break the whole install.
    await Promise.all(ASSETS.map(url =>
      cache.add(new Request(url, { cache: 'reload' }))
        .catch(err => console.warn('[cookup sw] skipped', url, err))
    ));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: fresh if possible, cached shell otherwise.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (err) {
        const cache = await caches.open(CACHE);
        return (await cache.match('./index.html')) ||
               (await cache.match('./')) ||
               Response.error();
      }
    })());
    return;
  }

  // Assets: serve from cache instantly, refresh in the background.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);

    const network = fetch(request).then(response => {
      if (response && response.status === 200 && response.type === 'basic') {
        cache.put(request, response.clone());
      }
      return response;
    }).catch(() => null);

    return cached || (await network) || Response.error();
  })());
});
