# Mejoras RepartoJusto
**Fecha:** 2026-08-24
**Estado:** 5 mejoras identificadas — 3 de seguridad, 1 de rendimiento, 1 de UX/negocio

---

## 1. `pedido:seguir` sin verificar propiedad — cualquier usuario puede espiar tracking ajeno

**Archivo:** `backend/src/sockets/index.js:101`
**Beneficio:** Impide que un usuario autenticado (negocio o rider ajeno) se suscriba al tracking en tiempo real de cualquier pedido solo conociendo su ID.

```js
// Antes (línea 101-104):
socket.on('pedido:seguir', ({ pedido_id }) => {
  if (!pedido_id) return;
  socket.join(`pedido:${pedido_id}`);
});

// Después:
socket.on('pedido:seguir', async ({ pedido_id }) => {
  if (!pedido_id) return;
  const { rows: [ped] } = await db(
    `SELECT negocio_id, rider_id FROM pedidos WHERE id = $1`, [pedido_id]
  ).catch(() => ({ rows: [] }));
  if (!ped) return;
  const autorizado =
    rol === 'admin' ||
    (rol === 'negocio' && ped.negocio_id === socket.negocio_id) ||
    (rol === 'rider'   && ped.rider_id   === socket.rider_id);
  if (!autorizado) return;
  socket.join(`pedido:${pedido_id}`);
});
```

---

## 2. `rider:ubicacion` escribe en PostgreSQL en cada evento — saturación de BD bajo carga

**Archivo:** `backend/src/sockets/index.js:67`
**Beneficio:** Evita que actualizaciones de GPS a 1–2 Hz generen decenas de `UPDATE` por segundo en PostgreSQL; un throttle por rider reduce las escrituras ~90 % manteniendo el tracking preciso.

```js
// Añadir al inicio del módulo (justo antes de module.exports):
const _ubicThrottle = new Map(); // rider_id → ultimo timestamp escritura

// Reemplazar el UPDATE dentro de 'rider:ubicacion' (línea 72-75):
// Antes:
await db('UPDATE riders SET lat = $1, lng = $2 WHERE id = $3', [lat, lng, socket.rider_id]);

// Después (throttle de 5 segundos por rider):
const ahora = Date.now();
const ultimo = _ubicThrottle.get(socket.rider_id) || 0;
if (ahora - ultimo >= 5000) {
  _ubicThrottle.set(socket.rider_id, ahora);
  await db('UPDATE riders SET lat = $1, lng = $2 WHERE id = $3', [lat, lng, socket.rider_id]);
}
// El broadcast a negocios y sala del pedido ocurre igual, sin throttle.
```

---

## 3. Webhook de Flow acepta requests sin firma en modo sandbox — pagos falsos confirmables

**Archivo:** `backend/src/routes/pagos.js:143`
**Beneficio:** Bloquea la confirmación de pagos fraudulentos en entornos sandbox compartidos o cuando `FLOW_SECRET` está configurado pero el entorno no está en producción.

```js
// Antes (línea 143-148): sandbox sin secreto → solo advertencia, sigue procesando
if (!flowSecret) {
  if (config.FLOW_ENVIRONMENT !== 'sandbox') {
    console.error('❌ FLOW_SECRET no configurado en producción — webhook rechazado');
    return res.status(401).end();
  }
  console.warn('⚠️  FLOW_SECRET no configurado: webhook sin validación (solo sandbox)');
}

// Después: si hay secreto, siempre validar firma sin importar el entorno
if (!flowSecret) {
  if (config.FLOW_ENVIRONMENT !== 'sandbox') {
    console.error('❌ FLOW_SECRET no configurado en producción — webhook rechazado');
    return res.status(401).end();
  }
  // Sandbox sin secreto: se permite solo para desarrollo local sin secreto configurado
  console.warn('⚠️  Webhook sin validación: configura FLOW_SECRET para mayor seguridad');
} else {
  // Con secreto configurado: validar firma SIEMPRE, independiente del entorno
  const receivedSig = req.headers['x-flow-signature'];
  if (!receivedSig) {
    console.warn('⚠️  Webhook rechazado: falta x-flow-signature');
    return res.status(401).end();
  }
  const params = Object.keys(req.body).sort().reduce((acc, k) => acc + k + req.body[k], '');
  const expected = crypto.createHmac('sha256', flowSecret).update(params).digest('hex');
  let sigValid = false;
  try {
    sigValid = crypto.timingSafeEqual(Buffer.from(receivedSig, 'hex'), Buffer.from(expected, 'hex'));
  } catch { sigValid = false; }
  if (!sigValid) {
    console.warn('⚠️  Webhook rechazado: firma inválida');
    return res.status(401).end();
  }
}
```

---

## 4. Cancelación sin reembolso del cobro previo en modo activo — pérdida de confianza del negocio

**Archivo:** `backend/src/routes/pedidos.js:318`
**Beneficio:** Cuando un negocio cancela un pedido ya cobrado (modo activo), actualmente no se intenta ningún reembolso; agregar la llamada de reembolso y registrar el intento mejora la transparencia y reduce disputas.

```js
// Añadir después de la actualización del pedido en PUT /:id/cancelar (línea 355-367):
// Si el pedido tenía pago registrado y estaba en modo activo, intentar reembolso
if (!enPrueba) {
  const { rows: [pago] } = await db(
    `SELECT * FROM pagos WHERE pedido_id = $1 AND estado = 'pagado'`,
    [rows[0].id]
  );
  if (pago) {
    // TODO: llamar a flow.reembolsar({ flow_order_id: pago.flow_order_id, monto: pago.monto })
    // Por ahora: registrar intento para revisión manual
    await db(
      `UPDATE pagos SET estado = 'reembolso_pendiente', metadata = metadata || '{"cancelacion": true}'
       WHERE id = $1`,
      [pago.id]
    ).catch(err => console.error('❌ Error marcando reembolso:', err.message));
    console.warn(`⚠️  Pedido ${rows[0].id} cancelado con pago cobrado — reembolso pendiente manual`);
  }
}
```

---

## 5. `io.emit('pedido:nuevo')` hace broadcast global — negocios y admin reciben eventos de riders

**Archivo:** `backend/src/sockets/asignacion.js:80`
**Beneficio:** Restringe el broadcast de pedidos disponibles solo a sockets del room `riders_disponibles`, evitando que negocios o clientes reciban datos internos del motor de asignación.

```js
// En iniciarScheduler o al conectar un rider, unirlo a un room dedicado:
// En sockets/index.js, dentro del bloque if (rol === 'rider') (línea 48-56), añadir:
socket.join('riders_disponibles');

// En sockets/asignacion.js línea 80 — cambiar broadcast global por room específico:
// Antes:
io.emit('pedido:nuevo', _payload(pedido));

// Después:
io.to('riders_disponibles').emit('pedido:nuevo', _payload(pedido));
```

---

*Generado automáticamente por el Agente de Mejoras de RepartoJusto — 2026-08-24.*
