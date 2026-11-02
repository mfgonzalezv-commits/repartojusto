# Mejoras RepartoJusto
**Fecha:** 2026-11-02
**Estado:** 5 mejoras identificadas — 2 de seguridad crítica, 2 de rendimiento, 1 de UX

---

## 1. Seguimiento de pedido sin validación de acceso
**Archivo:** `backend/src/sockets/index.js:101-104`  
**Beneficio:** Evita que cualquier usuario autenticado espíe el tracking en tiempo real de pedidos ajenos.

```js
// Antes (sin validación):
socket.on('pedido:seguir', ({ pedido_id }) => {
  if (!pedido_id) return;
  socket.join(`pedido:${pedido_id}`);
});

// Después (validar que el usuario pertenece al pedido):
socket.on('pedido:seguir', async ({ pedido_id }) => {
  if (!pedido_id) return;
  try {
    const { rows } = await db(
      `SELECT 1 FROM pedidos p
       WHERE p.id = $1
         AND (
           (SELECT id FROM negocios WHERE usuario_id = $2) = p.negocio_id
           OR p.rider_id = (SELECT id FROM riders WHERE usuario_id = $2)
         )`,
      [pedido_id, usuarioId]
    );
    if (rows.length) socket.join(`pedido:${pedido_id}`);
  } catch (err) {
    console.error('❌ Error al validar seguimiento:', err.message);
  }
});
```

---

## 2. Chat sin límite de longitud de mensaje
**Archivo:** `backend/src/sockets/index.js:161-163`  
**Beneficio:** Previene que mensajes gigantes saturen la memoria del servidor y el historial en Map.

```js
// Antes:
socket.on('chat:enviar', ({ pedido_id, texto }) => {
  if (!pedido_id || !texto || !String(texto).trim()) return;

// Después (agregar límite de 500 caracteres):
socket.on('chat:enviar', ({ pedido_id, texto }) => {
  if (!pedido_id || !texto || !String(texto).trim()) return;
  const textoLimpio = String(texto).trim().slice(0, 500);
  if (!textoLimpio) return;
  // ... reemplazar `texto` por `textoLimpio` en el resto del handler
```

---

## 3. Condición de carrera: cobro antes de persistir el pedido
**Archivo:** `backend/src/routes/pedidos.js:87-103`  
**Beneficio:** Evita cobrar al negocio sin crear el pedido cuando la DB falla después del cargo.

```js
// Antes: cobro fuera de la transacción de BD, antes del INSERT
if (!enPrueba) {
  // ...cobro aquí...
}
const { rows: [pedido] } = await db(`INSERT INTO pedidos ...`);

// Después: primero insertar en BD (puede rollback), luego cobrar
const tarifa_entrega = calcularTarifa(distancia_km);
const { cargo_negocio, cargo_cliente } = calcularCargos(...);

// INSERT primero, estado='pendiente_pago' hasta confirmar cobro
const { rows: [pedido] } = await db(
  `INSERT INTO pedidos (..., estado)
   VALUES (..., $15)
   RETURNING *`,
  [...params, enPrueba ? estadoInicial : 'pendiente_pago']
);

if (!enPrueba) {
  const cobro = await cobros.cobrar({ customerId: negocio.tarjeta_customer_id, monto: config.APP_FEE + tarifa_entrega });
  if (!cobro.ok) {
    await db(`UPDATE pedidos SET estado = 'cancelado', cancelado_motivo = 'Pago rechazado' WHERE id = $1`, [pedido.id]);
    return res.status(402).json({ error: 'Pago rechazado', detalle: 'No se pudo cobrar el servicio. Verifica tu tarjeta.' });
  }
  await db(`UPDATE pedidos SET estado = $1 WHERE id = $2`, [estadoInicial, pedido.id]);
}
```

---

## 4. Escritura a Postgres en cada actualización GPS del rider
**Archivo:** `backend/src/sockets/index.js:67-98`  
**Beneficio:** Reduce carga en Postgres: con 10 riders activos actualizando cada 2s son 300 writes/min; con throttle por rider bajan a ~30.

```js
// Antes: DB write en cada evento rider:ubicacion

// Después: throttle a 1 write por rider cada 5 segundos
const _lastUbicacionFlush = new Map(); // rider_id → timestamp

socket.on('rider:ubicacion', async ({ lat, lng }) => {
  if (rol !== 'rider' || !socket.rider_id) return;
  if (typeof lat !== 'number' || typeof lng !== 'number') return;

  const ahora = Date.now();
  const ultimo = _lastUbicacionFlush.get(socket.rider_id) || 0;
  const debePersistir = ahora - ultimo >= 5000;

  try {
    if (debePersistir) {
      _lastUbicacionFlush.set(socket.rider_id, ahora);
      await db('UPDATE riders SET lat = $1, lng = $2 WHERE id = $3', [lat, lng, socket.rider_id]);
    }

    // Broadcast en tiempo real (siempre, sin throttle)
    const { rows } = await db(
      `SELECT id, negocio_id FROM pedidos WHERE rider_id = $1 AND estado IN ('asignado','retiro','en_camino')`,
      [socket.rider_id]
    );
    rows.forEach((pedido) => {
      io.to(`negocio:${pedido.negocio_id}`).to(`pedido:${pedido.id}`)
        .emit('rider:ubicacion', { rider_id: socket.rider_id, pedido_id: pedido.id, lat, lng, timestamp: ahora });
    });
  } catch (err) {
    console.error('❌ Error al actualizar ubicación:', err.message);
  }
});
```

---

## 5. Consultas de autorización redundantes en GET /pedidos/:id
**Archivo:** `backend/src/routes/pedidos.js:426-459`  
**Beneficio:** Elimina 1-2 queries extra por request de detalle de pedido, integrando la verificación de acceso en la query principal.

```js
// Antes: fetcha el pedido completo, luego hace SELECT adicionales para negocios/riders

// Después: incorporar la autorización en la misma query con un filtro condicional
router.get('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await db(
      `SELECT p.*,
              n.nombre_comercial, n.direccion AS direccion_retiro, n.lat AS neg_lat, n.lng AS neg_lng,
              n.mostrar_costo_seguimiento,
              u_r.nombre AS rider_nombre, u_r.telefono AS rider_telefono,
              ri.vehiculo_tipo, ri.lat AS rider_lat, ri.lng AS rider_lng
       FROM pedidos p
       JOIN negocios n ON n.id = p.negocio_id
       LEFT JOIN riders ri ON ri.id = p.rider_id
       LEFT JOIN usuarios u_r ON u_r.id = ri.usuario_id
       WHERE p.id = $1
         AND (
           $2 = 'admin'
           OR ($2 = 'negocio' AND n.usuario_id = $3)
           OR ($2 = 'rider'   AND ri.usuario_id = $3)
         )`,
      [req.params.id, req.usuario.rol, req.usuario.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pedido no encontrado o sin acceso' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});
```
