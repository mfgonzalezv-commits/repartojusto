// Service Worker — Reparto Justo Rider PWA
// v5 — historial agrupado por fecha

const CACHE = 'rj-rider-v5';
const PRECACHE = ['/rider.html', '/manifest-rider.json', '/alarma.wav'];

// ── Instalación ───────────────────────────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

// ── Activación: limpiar cachés viejas ─────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first para HTML, caché para el resto ───────────────────────
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith(self.location.origin)) return;

  // rider.html siempre desde red para recibir actualizaciones
  if (e.request.url.includes('rider.html')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// ── Click en notificación → abrir/enfocar la app ──────────────────────────────
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if (client.url.includes('rider') && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow('/rider.html');
    })
  );
});

// ── Push: notificación OS con sonido del sistema ──────────────────────────────
self.addEventListener('push', function(event) {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: '¡Nuevo pedido!', body: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || '🔔 ¡Nuevo pedido!', {
      body: data.body || '¡Un pedido está esperando tu respuesta!',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'pedido-nuevo',
      renotify: true,
      requireInteraction: true,
      vibrate: [400, 100, 400, 100, 800, 200, 400],
    })
  );
});
