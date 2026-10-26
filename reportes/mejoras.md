# Mejoras RepartoJusto
**Fecha:** 2026-10-26
**Estado:** 5 mejoras identificadas — 2 de seguridad críticas, 2 de rendimiento, 1 de UX

---

## 1. Chat sin control de acceso — cualquier usuario puede escribir a cualquier pedido

**Archivo:** `backend/src/sockets/index.js:161`
**Beneficio:** Evita que un negocio o rider espíe o interfiera el chat de pedidos ajenos.

```js
// ANTES (línea 161):
socket.on('chat:enviar', ({ pedido_id, texto }) => {
  if (!pedido_id || !texto || !String(texto).trim()) return;
  const desde = rol === 'rider' ? 'rider' : 'negocio';
  // ... no verifica que este usuario tenga acceso al pedido
  io.to(`pedido:${pedido_id}`).emit('chat:mensaje', msg);
});

// DESPUÉS — agregar verificación en BD antes de difundir:
socket.on('chat:enviar', async ({ pedido_id, texto }) => {
  if (!pedido_id || !texto || !String(texto).trim()) return;

  // Verificar acceso: el usuario debe ser el negocio dueño o el rider asignado
  const { rows: [acceso] } = await db(
    `SELECT 1 FROM pedidos p
     LEFT JOIN negocios n ON n.id = p.negocio_id
     LEFT JOIN riders   r ON r.id = p.rider_id
     WHERE p.id = $1
       AND (n.usuario_id = $2 OR r.usuario_id = $2)`,
    [pedido_id, socket.usuario.id]
  ).catch(() => ({ rows: [] }));

  if (!acceso) return; // silenciosamente ignorar

  const desde = rol === 'rider' ? 'rider' : 'negocio';
  const msg = { desde, nombre, texto: String(texto).trim(), hora: new Date().toISOString() };

  if (!chatHistory.has(pedido_id)) chatHistory.set(pedido_id, []);
  const hist = chatHistory.get(pedido_id);
  hist.push(msg);
  if (hist.length > MAX_CHAT_MSG) hist.shift();

  io.to(`pedido:${pedido_id}`).emit('chat:mensaje', msg);
});
```

---

## 2. `pedido:seguir` sin autorización — cualquier usuario puede rastrear cualquier pedido

**Archivo:** `backend/src/sockets/index.js:101`
**Beneficio:** Impide que usuarios ajenos vean la ubicación en tiempo real del rider de un pedido que no les corresponde.

```js
// ANTES (línea 101):
socket.on('pedido:seguir', ({ pedido_id }) => {
  if (!pedido_id) return;
  socket.join(`pedido:${pedido_id}`); // sin ninguna verificación
});

// DESPUÉS — verificar acceso en BD antes de unirse al room:
socket.on('pedido:seguir', async ({ pedido_id }) => {
  if (!pedido_id) return;

  const { rows: [acceso] } = await db(
    `SELECT 1 FROM pedidos p
     LEFT JOIN negocios n ON n.id = p.negocio_id
     LEFT JOIN riders   r ON r.id = p.rider_id
     WHERE p.id = $1
       AND (n.usuario_id = $2 OR r.usuario_id = $2)`,
    [pedido_id, socket.usuario.id]
  ).catch(() => ({ rows: [] }));

  if (acceso) socket.join(`pedido:${pedido_id}`);
});
```

---

## 3. Race condition en `aceptarOferta` — rider puede ser desmarcado entre verificación y UPDATE

**Archivo:** `backend/src/sockets/asignacion.js:167`
**Beneficio:** Garantiza que la verificación de disponibilidad del rider y la asignación del pedido sean atómicas, evitando doble asignación o asignación a rider no disponible.

```js
// ANTES — dos queries separadas (líneas 167-190):
const { rows: [rider] } = await db(
  `SELECT id FROM riders WHERE id = $1 AND disponible = true`, [rider_id]
);
if (!rider) return { ok: false, error: 'No estás disponible' };
// ... más validaciones ...
const { rows: [pedido] } = await db(
  `UPDATE pedidos SET estado = 'asignado', rider_id = $1 ... WHERE id = $2 AND estado = 'pendiente'`,
  [rider_id, pedido_id]
);

// DESPUÉS — todo dentro de una transacción:
const { query: db, transaction } = require('../config/database');

async function aceptarOferta(pedido_id, rider_id, io) {
  const cascada = cascadas.get(pedido_id);
  if (cascada) { clearTimeout(cascada.timer); cascadas.delete(pedido_id); }

  return transaction(async (client) => {
    // Lock del rider para serializar intentos concurrentes
    const { rows: [rider] } = await client.query(
      `SELECT id FROM riders WHERE id = $1 AND disponible = true FOR UPDATE`,
      [rider_id]
    );
    if (!rider) return { ok: false, error: 'No estás disponible' };

    const { rows: [{ cnt }] } = await client.query(
      `SELECT COUNT(*) AS cnt FROM pedidos
       WHERE rider_id = $1 AND estado IN ('asignado','retiro','en_camino')`,
      [rider_id]
    );
    if (parseInt(cnt) >= MAX_PEDIDOS_SIMULTANEOS) {
      return { ok: false, error: `Límite de ${MAX_PEDIDOS_SIMULTANEOS} pedidos simultáneos` };
    }

    const { rows: [pedido] } = await client.query(
      `UPDATE pedidos SET estado = 'asignado', rider_id = $1, asignado_at = NOW()
       WHERE id = $2 AND estado = 'pendiente'
       RETURNING *`,
      [rider_id, pedido_id]
    );
    if (!pedido) return { ok: false, error: 'Pedido ya no disponible' };

    io.to(`negocio:${pedido.negocio_id}`).emit('pedido:actualizado', {
      id: pedido.id, estado: 'asignado', rider_id,
    });
    io.emit('pedido:tomado', { pedido_id });
    return { ok: true, pedido };
  }).catch(err => ({ ok: false, error: err.message }));
}
```

---

## 4. Doble roundtrip en `PUT /pedidos/:id/estado` — SELECT innecesario post-UPDATE

**Archivo:** `backend/src/routes/pedidos.js:246`
**Beneficio:** Elimina un SELECT extra a la BD en cada avance de estado, reduciendo latencia en el endpoint más frecuente del ciclo de vida del pedido.

```js
// ANTES (líneas 246-265): UPDATE sin RETURNING, luego SELECT complejo por separado
await db(`UPDATE pedidos SET estado = $1 ${extras} WHERE id = $2`, [nuevoEstado, pedido.id]);
const { rows: [actualizado] } = await db(`SELECT p.*, n.*, ... FROM pedidos p JOIN negocios n ...`, [pedido.id]);

// DESPUÉS — un solo UPDATE con RETURNING y JOIN usando CTE:
const { rows: [actualizado] } = await db(
  `WITH upd AS (
     UPDATE pedidos SET estado = $1 ${extras} WHERE id = $2 RETURNING *
   )
   SELECT upd.*,
          n.nombre_comercial, n.direccion AS direccion_retiro, n.lat AS neg_lat, n.lng AS neg_lng,
          n.mostrar_costo_seguimiento,
          u_r.nombre AS rider_nombre, u_r.telefono AS rider_telefono,
          ri.vehiculo_tipo, ri.lat AS rider_lat, ri.lng AS rider_lng
   FROM upd
   JOIN negocios n ON n.id = upd.negocio_id
   LEFT JOIN riders ri ON ri.id = upd.rider_id
   LEFT JOIN usuarios u_r ON u_r.id = ri.usuario_id`,
  [nuevoEstado, pedido.id]
);
```

---

## 5. `io.emit('rider:fuera_linea')` — broadcast global innecesario al desconectar rider

**Archivo:** `backend/src/sockets/index.js:187`
**Beneficio:** Reduce tráfico WebSocket innecesario hacia negocios y clientes que no necesitan saber qué riders están offline; solo el panel admin lo requiere.

```js
// ANTES (línea 187) — emite a TODOS los sockets conectados:
io.emit('rider:fuera_linea', { rider_id: socket.rider_id });

// DESPUÉS — emitir solo al room 'admin':
io.to('admin').emit('rider:fuera_linea', { rider_id: socket.rider_id });
```
