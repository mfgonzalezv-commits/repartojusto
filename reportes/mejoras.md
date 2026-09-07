# Mejoras RepartoJusto
**Fecha:** 2026-09-07
**Estado:** 5 mejoras identificadas — 3 de seguridad críticas sin corregir desde semana anterior, 1 de confiabilidad financiera (nueva), 1 de rendimiento

---

## 1. Seguridad: `pedido:seguir` sin verificación de acceso ⚠️ Sin corregir desde 2026-08-31

**Archivo:** `backend/src/sockets/index.js:101`

**Beneficio:** Evita que cualquier usuario autenticado espíe el tracking (ubicación GPS del rider, estado del pedido) de pedidos ajenos uniéndose arbitrariamente a su sala de socket.

**Código actual:**
```js
socket.on('pedido:seguir', ({ pedido_id }) => {
  if (!pedido_id) return;
  socket.join(`pedido:${pedido_id}`);
});
```

**Código propuesto:**
```js
socket.on('pedido:seguir', async ({ pedido_id }) => {
  if (!pedido_id) return;
  try {
    const { rows } = await db(
      `SELECT id FROM pedidos
       WHERE id = $1
         AND (
           (negocio_id = $2 AND $2 IS NOT NULL)
           OR (rider_id = $3 AND $3 IS NOT NULL)
           OR $4 = 'admin'
         )`,
      [pedido_id, socket.negocio_id || null, socket.rider_id || null, rol]
    );
    if (rows[0]) socket.join(`pedido:${pedido_id}`);
  } catch (err) {
    console.error('❌ pedido:seguir acceso denegado:', err.message);
  }
});
```

---

## 2. Confiabilidad: Race condition en `aceptarOferta` borra cascada antes de confirmar asignación ⚠️ Sin corregir desde 2026-08-31

**Archivo:** `backend/src/sockets/asignacion.js:162`

**Beneficio:** Evita que un pedido quede huérfano en estado `pendiente` sin cascada activa cuando la asignación en BD falla tras borrar el estado de cascada en memoria.

**Código actual:**
```js
async function aceptarOferta(pedido_id, rider_id, io) {
  const cascada = cascadas.get(pedido_id);
  if (cascada) {
    clearTimeout(cascada.timer);
    cascadas.delete(pedido_id); // ← se borra antes de confirmar en BD
  }
  // ...si el UPDATE falla, el pedido queda sin cascada y sin rider
```

**Código propuesto:**
```js
async function aceptarOferta(pedido_id, rider_id, io) {
  const cascada = cascadas.get(pedido_id);
  if (cascada) clearTimeout(cascada.timer); // pausar timer, NO borrar aún

  const { rows: [rider] } = await db(
    `SELECT id FROM riders WHERE id = $1 AND disponible = true`, [rider_id]
  );
  if (!rider) return { ok: false, error: 'No estás disponible' };

  const { rows: [{ cnt }] } = await db(
    `SELECT COUNT(*) AS cnt FROM pedidos
     WHERE rider_id = $1 AND estado IN ('asignado','retiro','en_camino')`, [rider_id]
  );
  if (parseInt(cnt) >= MAX_PEDIDOS_SIMULTANEOS)
    return { ok: false, error: `Límite de ${MAX_PEDIDOS_SIMULTANEOS} pedidos simultáneos` };

  const { rows: [pedido] } = await db(
    `UPDATE pedidos SET estado = 'asignado', rider_id = $1, asignado_at = NOW()
     WHERE id = $2 AND estado = 'pendiente' RETURNING *`,
    [rider_id, pedido_id]
  );
  if (!pedido) return { ok: false, error: 'Pedido ya no disponible' };

  cascadas.delete(pedido_id); // ← solo borrar tras asignación exitosa en BD

  io.to(`negocio:${pedido.negocio_id}`).emit('pedido:actualizado', {
    id: pedido.id, estado: 'asignado', rider_id,
  });
  io.emit('pedido:tomado', { pedido_id });
  return { ok: true, pedido };
}
```

---

## 3. Confiabilidad financiera: Cobro al negocio antes de confirmar el pedido en BD (nueva)

**Archivo:** `backend/src/routes/pedidos.js:74`

**Beneficio:** Elimina el riesgo de cobrar a un negocio sin crear el pedido en BD — si el INSERT falla tras el cobro (error de red, constraint violation, timeout), el dinero se pierde sin registro y sin posibilidad de reembolso automático.

**Código actual:**
```js
// Línea 74 — cobro ocurre ANTES del INSERT (línea 111)
const cobro = await cobros.cobrar({
  customerId: negocio.tarjeta_customer_id,
  monto: config.APP_FEE + tarifa_entrega_pre,
});
if (!cobro.ok) {
  return res.status(402).json({ error: 'Pago rechazado', ... });
}
// ... más validaciones y lógica ...
const { rows: [pedido] } = await db(
  `INSERT INTO pedidos (...) VALUES (...) RETURNING *`,
  [...]
);
```

**Código propuesto:** Crear el pedido en BD primero con estado `pendiente_pago`, luego cobrar, luego actualizar a `pendiente`:
```js
// 1. Crear pedido en BD con estado pendiente_pago
const { rows: [pedido] } = await db(
  `INSERT INTO pedidos (..., estado)
   VALUES (..., 'pendiente_pago') RETURNING *`,
  [...]
);

// 2. Intentar cobro (ahora con pedido_id real para trazabilidad)
const cobro = await cobros.cobrar({
  customerId: negocio.tarjeta_customer_id,
  monto: config.APP_FEE + tarifa_entrega,
  pedido_id: pedido.id,
});
if (!cobro.ok) {
  await db(`UPDATE pedidos SET estado = 'cancelado' WHERE id = $1`, [pedido.id]);
  return res.status(402).json({ error: 'Pago rechazado', detalle: 'No se pudo cobrar el servicio. Verifica tu tarjeta.' });
}

// 3. Activar pedido
await db(`UPDATE pedidos SET estado = $1 WHERE id = $2`, [estadoInicial, pedido.id]);
```

---

## 4. Rendimiento: Escritura en BD en cada ping GPS del rider ⚠️ Sin corregir desde 2026-08-31

**Archivo:** `backend/src/sockets/index.js:72`

**Beneficio:** Reduce hasta 10× las escrituras en la tabla `riders` (y la contención de locks) sin degradar la experiencia de tracking en tiempo real para el cliente final.

**Código actual:**
```js
socket.on('rider:ubicacion', async ({ lat, lng }) => {
  if (rol !== 'rider' || !socket.rider_id) return;
  if (typeof lat !== 'number' || typeof lng !== 'number') return;
  try {
    await db(
      'UPDATE riders SET lat = $1, lng = $2 WHERE id = $3',
      [lat, lng, socket.rider_id]
    );
    // ... luego broadcast
```

**Código propuesto:** Agregar throttle en memoria para la escritura en BD (el broadcast a clientes sigue sin cambio):
```js
const _ultimaEscrituraUbicacion = new Map(); // fuera del handler de connection

socket.on('rider:ubicacion', async ({ lat, lng }) => {
  if (rol !== 'rider' || !socket.rider_id) return;
  if (typeof lat !== 'number' || typeof lng !== 'number') return;

  try {
    const ahora = Date.now();
    const ultima = _ultimaEscrituraUbicacion.get(socket.rider_id) || 0;

    if (ahora - ultima >= 5000) { // máx una escritura en BD cada 5 s
      await db(
        'UPDATE riders SET lat = $1, lng = $2 WHERE id = $3',
        [lat, lng, socket.rider_id]
      );
      _ultimaEscrituraUbicacion.set(socket.rider_id, ahora);
    }

    // broadcast a clientes (sin throttle — siempre se envía)
    const { rows } = await db(
      `SELECT id, negocio_id FROM pedidos
       WHERE rider_id = $1 AND estado IN ('asignado','retiro','en_camino')`,
      [socket.rider_id]
    );
    rows.forEach((pedido) => {
      io.to(`negocio:${pedido.negocio_id}`)
        .to(`pedido:${pedido.id}`)
        .emit('rider:ubicacion', { rider_id: socket.rider_id, pedido_id: pedido.id, lat, lng, timestamp: ahora });
    });
  } catch (err) {
    console.error('❌ Error al actualizar ubicación:', err.message);
  }
});
```

---

## 5. Seguridad: Chat sin límite de tamaño de mensaje (DoS) ⚠️ Sin corregir desde 2026-08-31

**Archivo:** `backend/src/sockets/index.js:161`

**Beneficio:** Previene que un actor malicioso inunde memoria del servidor y los clientes conectados enviando mensajes de chat de tamaño arbitrario.

**Código actual:**
```js
socket.on('chat:enviar', ({ pedido_id, texto }) => {
  if (!pedido_id || !texto || !String(texto).trim()) return;
  const desde = rol === 'rider' ? 'rider' : 'negocio';
  const msg = { desde, nombre, texto: String(texto).trim(), hora: new Date().toISOString() };
```

**Código propuesto:**
```js
const MAX_CHAT_BYTES = 500;

socket.on('chat:enviar', ({ pedido_id, texto }) => {
  if (!pedido_id || !texto) return;
  const textoLimpio = String(texto).trim().slice(0, MAX_CHAT_BYTES);
  if (!textoLimpio) return;
  const desde = rol === 'rider' ? 'rider' : 'negocio';
  const msg = { desde, nombre, texto: textoLimpio, hora: new Date().toISOString() };
```

---

## Resumen de estado

| # | Mejora | Prioridad | Estado |
|---|--------|-----------|--------|
| 1 | `pedido:seguir` sin auth | 🔴 Alta | Pendiente (2ª semana) |
| 2 | Race condition `aceptarOferta` | 🔴 Alta | Pendiente (2ª semana) |
| 3 | Cobro antes de INSERT en BD | 🟠 Media | **Nueva** |
| 4 | GPS throttle | 🟡 Media | Pendiente (2ª semana) |
| 5 | Chat sin límite de tamaño | 🟡 Media | Pendiente (2ª semana) |
