/* Ganjineh Ofogh — service worker (built to /sw.js by tools/build_site.py; 037623a79843 is a hash of the whole site).
 *
 * Why: the static host this preview runs on cannot send long cache headers, so every repeat visit re-validates dozens
 * of pictures. This keeps the files that never change under a given build on the visitor's device.
 *
 *   pictures, fonts, 3D models and libraries, versioned (?v=) files  → cache first (they are content-named)
 *   HTML, and scripts/styles/JSON that are not versioned             → network first, cached copy only if the network
 *                                                                      fails or takes longer than 4 s
 *   /api/*, /admin*, forms (POST), Range requests, other origins     → never touched
 *
 * Every deploy changes 037623a79843, so the first activation of a new build deletes every older cache: nothing from a
 * previous build can outlive it. No tracking, no analytics, nothing is sent anywhere.
 */
'use strict';
const VERSION = '037623a79843';
const CACHE = 'ofogh-' + VERSION;
const NETWORK_TIMEOUT = 4000;
const WARM_LIMIT = 160;
const BINARY = /\.(?:avif|webp|jpe?g|png|gif|svg|ico|woff2?|glb|gltf|bin|ktx2|hdr)$/i;
const VERSIONED = /[?&]v=[0-9a-f]{6,}/i;
const CODE = /\.(?:m?js|css|json|webmanifest|xml|txt)$/i;

const isCacheFirst = (url) => BINARY.test(url.pathname) || /\/vendor\//.test(url.pathname) || VERSIONED.test(url.search);
const isHtml = (request) => request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('ofogh-') && key !== CACHE) await caches.delete(key);
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch (e) { /* optional */ } }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (/\/(?:api|admin)(?:\/|$)/.test(url.pathname) || url.searchParams.has('nosw')) return;
  if (isHtml(request)) { event.respondWith(networkFirst(event, request, true)); return; }
  if (isCacheFirst(url)) { event.respondWith(cacheFirst(event, request)); return; }
  if (CODE.test(url.pathname)) { event.respondWith(networkFirst(event, request, false)); }
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.type === 'warm' && Array.isArray(data.urls)) event.waitUntil(warm(data.urls, data.pages));
});

const storable = (response) => response && response.ok && response.status === 200 && response.type === 'basic';

async function cacheFirst(event, request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (storable(response)) event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
  return response;
}

async function networkFirst(event, request, ignoreSearch) {
  const cache = await caches.open(CACHE);
  const key = ignoreSearch ? new Request(new URL(request.url).origin + new URL(request.url).pathname) : request;
  const network = (async () => {
    const preloaded = event.preloadResponse ? await event.preloadResponse : undefined;
    const response = preloaded || await fetch(request);
    if (storable(response)) cache.put(key, response.clone()).catch(() => {});
    return response;
  })();
  event.waitUntil(network.catch(() => {}));
  const cached = await cache.match(key);
  if (!cached) return network;
  return Promise.race([network.catch(() => cached), new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT))]);
}

// The page lists what it has just downloaded; those files are stored now, straight from the browser's own cache.
async function warm(urls, pages) {
  const cache = await caches.open(CACHE);
  // the page itself, so the first page a visitor opened also works offline and on a slow second visit
  for (const raw of (Array.isArray(pages) ? pages : []).slice(0, 2)) {
    try {
      const url = new URL(raw, self.location.href);
      if (url.origin !== self.location.origin || /\/(?:api|admin)(?:\/|$)/.test(url.pathname)) continue;
      const response = await fetch(new Request(url.href));
      if (storable(response)) await cache.put(new Request(url.origin + url.pathname), response);
    } catch (e) { /* optional */ }
  }
  for (const raw of urls.slice(0, WARM_LIMIT)) {
    try {
      const url = new URL(raw, self.location.href);
      if (url.origin !== self.location.origin || !isCacheFirst(url)) continue;
      const request = new Request(url.href);
      if (await cache.match(request)) continue;
      const response = await fetch(request);
      if (storable(response)) await cache.put(request, response);
    } catch (e) { /* a file that cannot be stored is simply fetched next time */ }
  }
}
