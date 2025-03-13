const CACHE_NAME = 'my-pwa-cache-v3'; // ✅ Updated cache version (forces refresh)
const urlsToCache = [
    '/tic-tac-toe/',
    '/tic-tac-toe/index.html',
    '/tic-tac-toe/styles.css',
    '/tic-tac-toe/script.js',
    '/tic-tac-toe/app.js',
    '/tic-tac-toe/manifest.json'
];

// ✅ Install event: Cache resources and force activation of new service worker
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Service Worker] Caching app shell');
                return cache.addAll(urlsToCache);
            })
    );
    self.skipWaiting(); // ✅ Forces the new service worker to take control immediately
});

// ✅ Fetch event: Try the network first, then fallback to cache
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // ✅ If successful, clone response & update cache
                return caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, response.clone());
                    return response;
                });
            })
            .catch(() => {
                // ✅ If offline or page not found, return `index.html`
                return caches.match(event.request).then(response => {
                    return response || caches.match('/tic-tac-toe/index.html');
                });
            })
    );
});

// ✅ Activate event: Delete old caches and take control immediately
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log(`[Service Worker] Deleting old cache: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // ✅ Forces pages to use the new cache immediately
    );
});
