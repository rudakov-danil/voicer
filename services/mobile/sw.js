// Cache only the public app shell. Never cache API requests, tokens or audio.
const CACHE = 'voicer-mobile-20261017-clinic';
const RELEASE = '/releases/20261017-clinic/';
const ASSETS = ['/', '/index.html','/app.html','/manifest.webmanifest','/icon.svg','/icon-192.png','/icon-512.png',
  ...['styles.css','app.js','storage.js','api.js','shift.js','coins.js','protocol.js','content.js','onest-cyrillic.woff2','onest-cyrillic-ext.woff2','onest-latin.woff2'].map(p=>RELEASE+p)];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
// Activation changes fetch handling only. Never reload tabs or touch IndexedDB/MediaRecorder.
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('voicer-mobile-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !ASSETS.includes(url.pathname)) return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}
    return response;
  }).catch(()=>caches.match(event.request,{ignoreSearch:true})));
});
