// Service worker de la app móvil: guarda la app y el formato (de donde salen los catálogos) para trabajar sin señal.
// Primero intenta la red para recibir actualizaciones; sin conexión usa la copia guardada.
const CACHE_NAME = 'peritia-campo-v4';
const APP_SHELL = [
  '/movil',
  '/',
  '/frontend/technical-descriptions.js',
  '/frontend/finishes-catalog.js',
  '/movil.webmanifest',
  '/movil/icon-192.png',
  '/movil/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Solo la app; las llamadas a /api siempre van al servidor.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !APP_SHELL.includes(url.pathname)) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(url.pathname, copy));
        }
        return response;
      })
      .catch(() => caches.match(url.pathname).then(cached => cached || Response.error()))
  );
});
