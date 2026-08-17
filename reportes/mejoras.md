# Mejoras RepartoJusto
**Fecha:** 2026-08-17
**Estado:** 5 mejoras identificadas — 3 de seguridad, 1 de rendimiento, 1 de memoria

---

## 1. `chat:enviar` sin verificar pertenencia al pedido — inyección de mensajes cruzados

**Archivo:** `backend/src/sockets/index.js:161`
**Beneficio:** Evita que cualquier usuario autenticado (rider o negocio ajeno) inyecte mensajes en el chat de un pedido que no le corresponde con solo conocer el `pedido_id`.

```js
// Antes (línea 161):
socket.on('chat:enviar', ({ pedido_id, texto }) => {
  if (!pedido_id || !texto || !String(texto).trim()) return;
  const desde = rol === 'rider' ? 'rider' : 'negocio';

// Después:
socket.on('chat:enviar', async ({ pedido_id, texto }) => {
  if (!pedido_id || !texto || !String(texto).trim()) return;

  const { rows: [ped] } = await db(
    `SELECT negocio_id, rider_id FROM pedidos WHERE id = $1`, [pedido_id]
  ).catch(() => ({ rows: [] }));
  if (!ped) return;

  const autorizado =
    rol === 'admin' ||
    (rol === 'negocio' && ped.negocio_id === socket.negocio_id) ||
    (rol === 'rider'   && ped.rider_id   === socket.rider_id);
  if (!autorizado) return socket.emit('chat:error', { error: 'Sin acceso a este pedido' });

  const desde = rol === 'rider' ? 'rider' : 'negocio';
```

---

## 2. `io.emit('rider:fuera_linea')` broadcast global — fuga de estado interno

**Archivo:** `backend/src/sockets/index.js:187`
**Beneficio:** Evita que clientes finales (clientes rastreando una entrega) reciban eventos internos del sistema de riders, reduciendo la superficie de información expuesta por WebSocket.

```js
// Antes (línea 187):
io.emit('rider:fuera_linea', { rider_id: socket.rider_id });

// Después:
io.to('admin').emit('rider:fuera_linea', { rider_id: socket.rider_id });
```

---

## 3. Memory leak en `_ubicacionStore` — Map sin evicción de entradas expiradas

**Archivo:** `backend/src/routes/riders.js:63`
**Beneficio:** Elimina el crecimiento indefinido de memoria del rate limiter de ubicación, que acumula una entrada por cada rider que alguna vez envió coordenadas y nunca las libera.

```js
// Añadir DESPUÉS de la función ubicacionRateLimit (línea 75):
setInterval(() => {
  const expiry = Date.now() - 60000;
  for (const [key, val] of _ubicacionStore) {
    if (val.first < expiry) _ubicacionStore.delete(key);
  }
}, 5 * 60 * 1000);
```

---

## 4. `push-subscription` almacenada sin validar estructura — inyección de datos arbitrarios

**Archivo:** `backend/src/routes/riders.js:195`
**Beneficio:** Previene que un actor malicioso almacene objetos arbitrarios de gran tamaño o con campos extraños en la columna `push_subscription`, lo que podría corromper el motor de notificaciones push.

```js
// Antes (línea 198):
const { subscription } = req.body;
if (!subscription) return res.status(400).json({ error: 'Suscripción requerida' });
await db(
  `UPDATE riders SET push_subscription = $1 WHERE usuario_id = $2`,
  [JSON.stringify(subscription), req.usuario.id]
);

// Después:
const { subscription } = req.body;
if (!subscription || typeof subscription !== 'object') {
  return res.status(400).json({ error: 'Suscripción requerida' });
}
if (typeof subscription.endpoint !== 'string' || !subscription.endpoint.startsWith('https://')) {
  return res.status(400).json({ error: 'Suscripción inválida: endpoint requerido' });
}
if (!subscription.keys ||
    typeof subscription.keys.p256dh !== 'string' ||
    typeof subscription.keys.auth !== 'string') {
  return res.status(400).json({ error: 'Suscripción inválida: keys requeridas' });
}
const cleanSub = {
  endpoint: subscription.endpoint,
  expirationTime: subscription.expirationTime || null,
  keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
};
await db(
  `UPDATE riders SET push_subscription = $1 WHERE usuario_id = $2`,
  [JSON.stringify(cleanSub), req.usuario.id]
);
```

---

## 5. Doble query de autorización en `GET /pedidos/:id` — round-trips innecesarios a BD

**Archivo:** `backend/src/routes/pedidos.js:374`
**Beneficio:** Elimina 2 queries extra por cada llamada a `GET /api/pedidos/:id` (una para negocio, otra para rider) añadiendo `usuario_id` a la query principal que ya hace el JOIN con esas tablas.

```js
// Antes — query en línea 377, sin usuario_id de negocio ni de rider:
SELECT p.*,
       n.nombre_comercial, n.direccion AS direccion_retiro, n.lat AS neg_lat, n.lng AS neg_lng,
       n.mostrar_costo_seguimiento,
       u_r.nombre AS rider_nombre, u_r.telefono AS rider_telefono,
       ri.vehiculo_tipo, ri.lat AS rider_lat, ri.lng AS rider_lng
FROM pedidos p
JOIN negocios n ON n.id = p.negocio_id
LEFT JOIN riders ri ON ri.id = p.rider_id
LEFT JOIN usuarios u_r ON u_r.id = ri.usuario_id
WHERE p.id = $1

// Después — añadir n.usuario_id y ri.usuario_id a la misma query:
SELECT p.*,
       n.nombre_comercial, n.direccion AS direccion_retiro, n.lat AS neg_lat, n.lng AS neg_lng,
       n.mostrar_costo_seguimiento, n.usuario_id AS negocio_usuario_id,
       u_r.nombre AS rider_nombre, u_r.telefono AS rider_telefono,
       ri.vehiculo_tipo, ri.lat AS rider_lat, ri.lng AS rider_lng,
       ri.usuario_id AS rider_usuario_id
FROM pedidos p
JOIN negocios n ON n.id = p.negocio_id
LEFT JOIN riders ri ON ri.id = p.rider_id
LEFT JOIN usuarios u_r ON u_r.id = ri.usuario_id
WHERE p.id = $1

// Y reemplazar el bloque de autorización (líneas 394-403) por:
if (rol === 'negocio' && pedido.negocio_usuario_id !== req.usuario.id) {
  return res.status(403).json({ error: 'Sin acceso a este pedido' });
}
if (rol === 'rider' && pedido.rider_usuario_id !== req.usuario.id) {
  return res.status(403).json({ error: 'Sin acceso a este pedido' });
}
```

---

*Generado automáticamente por el Agente de Mejoras de RepartoJusto — 2026-08-17.*
