const CACHE_NAME = 'rohan-uploader-cache-v3'; // New version
const urlsToCache = [
  '/My-Drive-Uploader/',
  '/My-Drive-Uploader/index.html',
  '/My-Drive-Uploader/manifest.json',
  '/My-Drive-Uploader/icon-192.png',
  '/My-Drive-Uploader/icon-512.png',
  '/My-Drive-Uploader/screenshot1.png',
  '/My-Drive-Uploader/screenshot2.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
