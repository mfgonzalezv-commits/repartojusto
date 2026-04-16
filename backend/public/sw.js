// Service Worker — Reparto Justo Rider
// Muestra notificaciones a nivel OS aunque el navegador esté en segundo plano

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// Al tocar la notificación → abrir/enfocar la app del rider
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
