# Mejoras RepartoJusto
**Fecha:** 2026-08-31
**Estado:** 5 mejoras identificadas — 3 de seguridad, 1 de rendimiento, 1 de confiabilidad

---

## 1. Seguridad: `pedido:seguir` sin verificación de acceso

**Archivo:** `backend/src/sockets/index.js:101`

**Beneficio:** Evita que cualquier usuario autenticado pueda espiar el tracking (ubicación del rider, estado) de pedidos ajenos uniéndose arbitrariamente a su sala de socket.

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

## 2. Confiabilidad: Race condition en `aceptarOferta` elimina cascada antes de confirmar asignación

**Archivo:** `backend/src/sockets/asignacion.js:162`

**Beneficio:** Evita que un pedido quede huérfano (estado `pendiente` sin cascada activa) cuando la asignación en BD falla después de haber borrado el estado de la cascada en memoria.

**Código actual:**
```js
async function aceptarOferta(pedido_id, rider_id, io) {
  const cascada = cascadas.get(pedido_id);
  if (cascada) {
    clearTimeout(cascada.timer);
    cascadas.delete(pedido_id); // ← se borra antes de confirmar en BD
  }
  // ...si el UPDATE falla, el pedido queda sin cascada y sin rider
  const { rows: [pedido] } = await db(
    `UPDATE pedidos SET estado = 'asignado' ... WHERE id = $2 AND estado = 'pendiente' RETURNING *`,
    [rider_id, pedido_id]
  );
  if (!pedido) return { ok: false, error: 'Pedido ya no disponible' };
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

## 3. Rendimiento: Escritura en BD en cada ping GPS del rider

**Archivo:** `backend/src/sockets/index.js:72`

**Beneficio:** Reduce hasta 10× las escrituras en la tabla `riders` sin degradar la experiencia de tracking en tiempo real para el cliente final.

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
    // ... luego broadcast a clientes
```

**Código propuesto:**
```js
// Al inicio del handler io.on('connection', ...) agregar:
const _ultimaEscrituraUbicacion = new Map();

socket.on('rider:ubicacion', async ({ lat, lng }) => {
  if (rol !== 'rider' || !socket.rider_id) return;
  if (typeof lat !== 'number' || typeof lng !== 'number') return;

  try {
    const ahora = Date.now();
    const ultima = _ultimaEscrituraUbicacion.get(socket.rider_id) || 0;

    if (ahora - ultima >= 5000) { // máx una escritura en BD cada 5 segundos
      await db(
        'UPDATE riders SET lat = $1, lng = $2 WHERE id = $3',
        [lat, lng, socket.rider_id]
      );
      _ultimaEscrituraUbicacion.set(socket.rider_id, ahora);
    }
    // el broadcast a clientes sigue ocurriendo en cada ping (sin cambio)
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

## 4. Seguridad: Chat sin límite de tamaño de mensaje (DoS)

**Archivo:** `backend/src/sockets/index.js:161`

**Beneficio:** Previene que un actor malicioso inunde el servidor y los clientes con mensajes de chat de tamaño arbitrario, saturando memoria y ancho de banda.

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

## 5. Seguridad: Longitud mínima de contraseña débil (6 caracteres)

**Archivo:** `backend/src/routes/auth.js:105` y `auth.js:146`

**Beneficio:** Cumple el mínimo recomendado por OWASP (8 caracteres) y reduce significativamente la superficie de ataques por fuerza bruta sobre contraseñas cortas.

**Código actual** (en ambos endpoints `registro/negocio` y `registro/rider`):
```js
body('password').isLength({ min: 6 }),
```

**Código propuesto:**
```js
body('password')
  .isLength({ min: 8 })
  .withMessage('La contraseña debe tener al menos 8 caracteres'),
```
