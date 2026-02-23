// Service Worker לקליכיף CRM
const CACHE_NAME = 'clickef-crm-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/index.css',
];

// התקנה
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// הפעלה
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// טיפול בבקשות
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // מחזיר מהמטמון אם קיים, אחרת מביא מהרשת
        return response || fetch(event.request);
      })
  );
});
