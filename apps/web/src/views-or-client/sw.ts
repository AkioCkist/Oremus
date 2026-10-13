/**
 * Service worker: keeps the app usable on flaky or missing connections.
 *
 * - Pages are always fetched from the network (they are personalized and carry CSRF tokens, so they are never cached);
 *   when the network is gone the anonymous /offline page is shown instead.
 * - Versioned /assets are immutable, so they are served cache-first. Unversioned assets use stale-while-revalidate.
 * - Uploaded photos have UUID names and never change, so they are cache-first with a size cap.
 * - /api, /auth, sockets and every non-GET request bypass the worker entirely.
 */

const sw = self as unknown as ServiceWorkerGlobalScope;

const VERSION = new URL(sw.location.href).searchParams.get('v') || 'dev';
const STATIC_CACHE = `oremus-static-${VERSION}`;
const RUNTIME_CACHE = 'oremus-runtime';
// Shared with the page (cleared on log out), so the name must stay in sync with app.ts.
const UPLOADS_CACHE = 'oremus-uploads';
const UPLOADS_MAX_ENTRIES = 300;
const OFFLINE_URL = '/offline';
const PRECACHE = [OFFLINE_URL, `/assets/styles.css?v=${VERSION}`, '/assets/brand/logo.svg', '/assets/brand/favicon.svg'];
const CDN_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.socket.io']);
const CACHEABLE_UPLOAD = /\.(webp|jpe?g|png|gif|svg|avif)$/i;

sw.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })));
    await sw.skipWaiting();
  })());
});

sw.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([STATIC_CACHE, RUNTIME_CACHE, UPLOADS_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('oremus-') && !keep.has(name)).map((name) => caches.delete(name)));
    await sw.registration.navigationPreload?.enable().catch(() => undefined);
    await sw.clients.claim();
  })());
});

sw.addEventListener('message', (event) => {
  if (event.data?.type === 'clear-user-cache') event.waitUntil(caches.delete(UPLOADS_CACHE));
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin !== sw.location.origin) {
    if (CDN_HOSTS.has(url.hostname)) event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }
  if (request.mode === 'navigate') { event.respondWith(networkFirstPage(event)); return; }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(url.searchParams.has('v') ? cacheFirst(request, STATIC_CACHE) : staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }
  // Videos are streamed with Range requests and can be hundreds of MB, so only photos are kept.
  if (url.pathname.startsWith('/uploads/') && CACHEABLE_UPLOAD.test(url.pathname) && !request.headers.has('range')) {
    event.respondWith(cacheFirst(request, UPLOADS_CACHE, UPLOADS_MAX_ENTRIES));
  }
});

async function networkFirstPage(event: FetchEvent): Promise<Response> {
  try {
    const preloaded = (await event.preloadResponse) as Response | undefined;
    return preloaded || await fetch(event.request);
  } catch {
    const offline = await caches.match(OFFLINE_URL);
    return offline || new Response('You are offline.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
}

async function cacheFirst(request: Request, cacheName: string, maxEntries?: number): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.status === 200) {
    await cache.put(request, response.clone());
    if (maxEntries) void trimCache(cache, maxEntries);
  }
  return response;
}

async function staleWhileRevalidate(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  // Any cache counts as a hit, so precached files (logo, favicon) are found too.
  const cached = await caches.match(request);
  const network = fetch(request).then(async (response) => {
    // Opaque cross-origin responses (status 0) are fine to keep; they are only replayed to the same request.
    if (response.status === 200 || response.type === 'opaque') await cache.put(request, response.clone());
    return response;
  });
  if (cached) { network.catch(() => undefined); return cached; }
  return network;
}

/** Cache keys come back in insertion order, so dropping from the front evicts the oldest entries first. */
async function trimCache(cache: Cache, maxEntries: number) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries)).map((key) => cache.delete(key)));
}
