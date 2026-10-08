// Cache only the public app shell. Never cache API requests, tokens or audio.
const CACHE = 'voicer-mobile-v1';
const ASSETS = ['/', '/index.html', '/styles.css', '/app.js', '/storage.js', '/api.js', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
// Do not skipWaiting: replacing code during a live recording can lose audio.
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('voicer-mobile-') && k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !ASSETS.includes(url.pathname)) return;
  event.respondWith(caches.match(event.request, {ignoreSearch: true}).then(cached => cached || fetch(event.request)));
});
