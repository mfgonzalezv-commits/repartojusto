// Service Worker — Reparto Justo Rider PWA
// v2 — caché básico + notificaciones OS

const CACHE = 'rj-rider-v1';
const PRECACHE = ['/rider.html', '/manifest-rider.json', '/icon-rider-512.svg'];

// ── Instalación: pre-cachear archivos esenciales ──────────────────────────────
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

// ── Fetch: servir desde caché si está disponible ──────────────────────────────
self.addEventListener('fetch', (e) => {
  // Solo manejar GETs del mismo origen
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith(self.location.origin)) return;

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

// ── Push (preparado para FCM futuro) ─────────────────────────────────────────
self.addEventListener('push', function(event) {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: '¡Nuevo pedido!', body: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || '🔔 ¡Nuevo pedido!', {
      body: data.body || '¡Un pedido está esperando tu respuesta!',
      icon: '/icon-rider-512.svg',
      badge: '/icon-rider-512.svg',
      tag: 'pedido-nuevo',
      renotify: true,
      requireInteraction: true,
      vibrate: [400, 100, 400, 100, 800, 200, 400],
    })
  );
});
