/* =============================================
   SERVICE WORKER — Amrik Singh PWA
   Strategy: Cache First for assets, Network First for HTML
============================================= */
const CACHE_NAME = 'amrik-singh-v4';
const STATIC_ASSETS = [
  './index.html',
  './liquid-glass.css',
  './liquid-glass.js',
  './hero-frames/frame_0001.jpg',
  './hero-frames-mobile/frame_0001.jpg',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500&family=Playfair+Display:ital,wght@0,400;0,600;1,400&display=swap'
];

/* ---------- INSTALL ---------- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('SW: Some assets failed to cache', err);
      });
    })
  );
  self.skipWaiting();
});

/* ---------- ACTIVATE ---------- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* ---------- FETCH ---------- */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, chrome-extension, and external API calls
  if (
    request.method !== 'GET' ||
    url.protocol === 'chrome-extension:' ||
    url.hostname.includes('google.com') ||
    url.hostname.includes('tiktok.com') ||
    url.hostname.includes('youtube.com') ||
    url.hostname.includes('anthropic.com')
  ) {
    return;
  }

  // HTML, CSS, JS: Network first, fallback to cache
  if (request.destination === 'document' || request.destination === 'style' || request.destination === 'script') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Images / fonts / assets: Cache first, network fallback
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, clone));
        return response;
      }).catch(() => {
        // Return nothing gracefully for non-critical assets
      });
    })
  );
});
