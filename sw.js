const CACHE_NAME = 'rohan-uploader-cache-v2'; // Naya version cache ko update karne ke liye
const urlsToCache = [
  '/My-Drive-Uploader/',
  '/My-Drive-Uploader/index.html',
  '/My-Drive-Uploader/manifest.json',
  '/My-Drive-Uploader/icon-192.png',
  '/My-Drive-Uploader/icon-512.png'
];

// Service worker ko install karein
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache khola gaya');
        return cache.addAll(urlsToCache);
      })
  );
});

// Requests ko cache karein aur return karein
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - response return karein
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});

// Puraane service worker ko update karein
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
