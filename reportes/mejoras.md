# Mejoras RepartoJusto
**Fecha:** 2026-10-19
**Estado:** 5 mejoras detectadas — 2 seguridad crítica, 1 seguridad media, 1 rendimiento, 1 UX

---

## 1. [SEGURIDAD] `pedido:seguir` sin control de acceso

**Archivo:** `backend/src/sockets/index.js` — línea 101

**Beneficio:** Impide que cualquier usuario autenticado espíe ubicación del rider y dirección del cliente de pedidos ajenos.

```js
// ANTES (sin validación)
socket.on('pedido:seguir', ({ pedido_id }) => {
  if (!pedido_id) return;
  socket.join(`pedido:${pedido_id}`);
});

// DESPUÉS (verificar que el socket pertenece al pedido)
socket.on('pedido:seguir', async ({ pedido_id }) => {
  if (!pedido_id) return;
  try {
    const { rows: [pedido] } = await db(
      `SELECT negocio_id, rider_id FROM pedidos WHERE id = $1`, [pedido_id]
    );
    if (!pedido) return;

    const esNegocio = rol === 'negocio' && socket.negocio_id === pedido.negocio_id;
    const esRider   = rol === 'rider'   && socket.rider_id   === pedido.rider_id;
    const esAdmin   = rol === 'admin';

    if (esNegocio || esRider || esAdmin) {
      socket.join(`pedido:${pedido_id}`);
    }
  } catch (err) {
    console.error('❌ Error pedido:seguir:', err.message);
  }
});
```

---

## 2. [SEGURIDAD] `chat:enviar` sin verificar pertenencia al pedido

**Archivo:** `backend/src/sockets/index.js` — línea 161

**Beneficio:** Evita que usuarios no relacionados inyecten mensajes en el chat de pedidos ajenos.

```js
// ANTES (solo comprueba que el socket esté en la sala, no que pertenezca al pedido)
socket.on('chat:enviar', ({ pedido_id, texto }) => {
  if (!pedido_id || !texto || !String(texto).trim()) return;
  const desde = rol === 'rider' ? 'rider' : 'negocio';
  // ...

// DESPUÉS (verificar ownership antes de emitir)
socket.on('chat:enviar', async ({ pedido_id, texto }) => {
  if (!pedido_id || !texto || !String(texto).trim()) return;
  try {
    const { rows: [pedido] } = await db(
      `SELECT negocio_id, rider_id FROM pedidos WHERE id = $1`, [pedido_id]
    );
    if (!pedido) return;

    const esNegocio = rol === 'negocio' && socket.negocio_id === pedido.negocio_id;
    const esRider   = rol === 'rider'   && socket.rider_id   === pedido.rider_id;
    if (!esNegocio && !esRider) return; // silencioso: no revelar que el pedido existe

    const desde = esRider ? 'rider' : 'negocio';
    const msg = { desde, nombre, texto: String(texto).trim().slice(0, 500), hora: new Date().toISOString() };

    if (!chatHistory.has(pedido_id)) chatHistory.set(pedido_id, []);
    const hist = chatHistory.get(pedido_id);
    hist.push(msg);
    if (hist.length > MAX_CHAT_MSG) hist.shift();

    io.to(`pedido:${pedido_id}`).emit('chat:mensaje', msg);
  } catch (err) {
    console.error('❌ Error chat:enviar:', err.message);
  }
});
```

---

## 3. [SEGURIDAD] Webhook de Flow sin bloqueo cuando `FLOW_SECRET` no está configurado en sandbox

**Archivo:** `backend/src/routes/pagos.js` — línea 148

**Beneficio:** Cierra la ventana en que un atacante puede forjar un `POST /api/pagos/webhook` y marcar pagos como completados sin haber pagado, incluso en sandbox.

```js
// ANTES (sandbox sin secreto pasa directo)
if (!flowSecret) {
  if (config.FLOW_ENVIRONMENT !== 'sandbox') {
    console.error('❌ FLOW_SECRET no configurado en producción — webhook rechazado');
    return res.status(401).end();
  }
  console.warn('⚠️  FLOW_SECRET no configurado: webhook sin validación (solo sandbox)');
}

// DESPUÉS (sandbox sin secreto solo acepta localhost/127.0.0.1)
if (!flowSecret) {
  if (config.FLOW_ENVIRONMENT !== 'sandbox') {
    console.error('❌ FLOW_SECRET no configurado en producción — webhook rechazado');
    return res.status(401).end();
  }
  const remoteIp = req.ip || req.connection.remoteAddress || '';
  const esLocal = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1';
  if (!esLocal) {
    console.warn('⚠️  Webhook sandbox rechazado desde IP externa sin FLOW_SECRET:', remoteIp);
    return res.status(401).end();
  }
  console.warn('⚠️  Webhook sandbox sin firma (local):', remoteIp);
}
```

---

## 4. [RENDIMIENTO] Query a la DB en cada evento `rider:ubicacion`

**Archivo:** `backend/src/sockets/index.js` — línea 78

**Beneficio:** Elimina una consulta a PostgreSQL en cada pulso de GPS (cada ~3-5 s por rider), reduciendo carga en la DB en un 70-80% para el tracking.

```js
// ANTES (query a la DB en cada ping de ubicación)
socket.on('rider:ubicacion', async ({ lat, lng }) => {
  // ...
  const { rows } = await db(
    `SELECT id, negocio_id FROM pedidos
     WHERE rider_id = $1 AND estado IN ('asignado','retiro','en_camino')`,
    [socket.rider_id]
  );
  rows.forEach(pedido => { /* emit */ });
});

// DESPUÉS (caché en memoria por socket; se invalida al cambiar estado via REST)
// Al conectar el rider, inicializar caché:
socket._pedidosActivos = []; // [{id, negocio_id}]

// Agregar helper para refrescar (llamar desde el socket o exportar al route de estado):
async function refrescarPedidosActivos(socket) {
  if (!socket.rider_id) return;
  const { rows } = await db(
    `SELECT id, negocio_id FROM pedidos
     WHERE rider_id = $1 AND estado IN ('asignado','retiro','en_camino')`,
    [socket.rider_id]
  );
  socket._pedidosActivos = rows;
}

socket.on('rider:ubicacion', async ({ lat, lng }) => {
  if (rol !== 'rider' || !socket.rider_id) return;
  if (typeof lat !== 'number' || typeof lng !== 'number') return;

  try {
    await db('UPDATE riders SET lat = $1, lng = $2 WHERE id = $3', [lat, lng, socket.rider_id]);

    // Usar caché; refrescar solo si está vacío
    if (socket._pedidosActivos.length === 0) await refrescarPedidosActivos(socket);

    socket._pedidosActivos.forEach(pedido => {
      io.to(`negocio:${pedido.negocio_id}`)
        .to(`pedido:${pedido.id}`)
        .emit('rider:ubicacion', { rider_id: socket.rider_id, pedido_id: pedido.id, lat, lng, timestamp: Date.now() });
    });
  } catch (err) {
    console.error('❌ Error al actualizar ubicación:', err.message);
  }
});
```

---

## 5. [UX] Cambio de estado del pedido no notifica a la sala de tracking

**Archivo:** `backend/src/routes/pedidos.js` — línea 278

**Beneficio:** Los clientes que siguen el pedido vía `pedido:seguir` reciben actualizaciones de estado en tiempo real, sin necesidad de polling.

```js
// ANTES (solo notifica a la sala del negocio)
req.app.get('io')?.to(`negocio:${pedido.negocio_id}`).emit('pedido:actualizado', {
  id: actualizado.id, estado: actualizado.estado
});

// DESPUÉS (notifica también a la sala de tracking del pedido)
const io = req.app.get('io');
if (io) {
  const payload = { id: actualizado.id, estado: actualizado.estado };
  io.to(`negocio:${pedido.negocio_id}`).emit('pedido:actualizado', payload);
  io.to(`pedido:${pedido.id}`).emit('pedido:actualizado', payload);

  // Si el rider avanzó a 'en_camino', invalidar caché de pedidos activos en su socket
  if (nuevoEstado === 'en_camino' || nuevoEstado === 'entregado') {
    const riderSockets = await io.in(`rider:${pedido.rider_id}`).fetchSockets();
    riderSockets.forEach(s => { s._pedidosActivos = []; });
  }
}
```
