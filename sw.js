const CACHE_NAME = 'c-form-cache-c6c67d016be7';
const ASSETS = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

// A new version waits for the page's 更新 button (src/pwa/updatePrompt.js) instead of taking
// over mid-edit on its own.
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Only same-origin GETs are cacheable. The old handler tried to cache.put() every request,
  // which throws on a POST and on an opaque cross-origin response — and on failure fell back to
  // caches.match(), resolving with undefined and breaking every Drive API call while offline.
  // Anything else goes straight to the network so the sync layer sees real errors.
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
