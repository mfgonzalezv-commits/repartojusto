# Mejoras RepartoJusto
**Fecha:** 2026-07-27
**Estado:** 5 mejoras identificadas — 3 de seguridad (2 críticas), 1 riesgo financiero, 1 rendimiento, 1 UX/escalabilidad

---

## 1. [Seguridad Crítica] Autenticación faltante en `POST /calificaciones` — puntajes de riders manipulables sin sesión

**Archivo:** `backend/src/routes/calificaciones.js:41`

**Beneficio:** Impide que cualquier tercero anónimo infle o dañe el score de un rider, protegiendo el ranking de asignación y los ingresos.

El middleware `auth` está importado pero nunca aplicado al `POST /`. Para `tipo === 'cliente'` no existe ninguna verificación de identidad ni de propiedad del pedido — cualquier cliente HTTP anónimo puede enviar una calificación para cualquier pedido entregado. El bloque JWT manual para `tipo === 'negocio'` (líneas 73–93) es una reimplementación frágil que además se saltea completamente para calificaciones de cliente.

```js
// ❌ Antes (línea 41) — auth completamente ausente
router.post('/',
  califRateLimit,
  [
    body('pedido_id').isUUID(),
    body('tipo').isIn(['negocio','cliente']),
    ...
  ],

// ✅ Después — requerir JWT válido para todos los tipos
router.post('/',
  califRateLimit,
  auth,
  [
    body('pedido_id').isUUID(),
    body('tipo').isIn(['negocio','cliente']),
    ...
  ],
  async (req, res, next) => {
    // Para tipo 'negocio', reemplazar el bloque JWT manual por:
    if (tipo === 'negocio' && req.usuario.rol !== 'negocio') {
      return res.status(403).json({ error: 'Solo negocios pueden calificar como negocio' });
    }
```

---

## 2. [Riesgo Financiero] Cobro ejecutado fuera de la transacción de DB — cargo sin pedido en caso de fallo

**Archivo:** `backend/src/routes/pedidos.js:59`

**Beneficio:** Elimina la ventana donde un negocio queda cobrado por un pedido que nunca aparece en el sistema, evitando disputas financieras y soporte innecesario.

`cobros.cobrar()` se confirma antes del `INSERT INTO pedidos`. Si el insert falla (violación de constraint, pérdida de conexión, etc.), el negocio está cobrado pero el pedido no existe — sin ningún rollback ni lógica de reembolso compensatoria.

```js
// ❌ Antes — cobro y DB en operaciones separadas
const cobro = await cobros.cobrar({
  customerId: negocio.tarjeta_customer_id,
  monto: config.APP_FEE + tarifa_entrega_pre,
});
if (!cobro.ok) {
  return res.status(402).json({ error: 'Pago rechazado' });
}
// ~25 líneas después, DB separada sin rollback:
const { rows: [pedido] } = await db(`INSERT INTO pedidos ...`, [...]);

// ✅ Después — atómico dentro de una transacción
const { pedido, cobro } = await transaction(async (client) => {
  const tarifa_entrega = calcularTarifa(distancia_km);

  // Primero persistir en estado temporal
  const { rows: [pedido] } = await client.query(
    `INSERT INTO pedidos (..., estado) VALUES (..., 'pago_pendiente') RETURNING *`, [...]
  );

  // Cobrar solo tras el insert; si falla, la transacción hace rollback automático
  const cobro = await cobros.cobrar({ customerId: negocio.tarjeta_customer_id, monto: ... });
  if (!cobro.ok) throw Object.assign(new Error('Pago rechazado'), { status: 402 });

  await client.query(
    `UPDATE pedidos SET estado = 'pendiente' WHERE id = $1`, [pedido.id]
  );
  return { pedido, cobro };
});
```

---

## 3. [Seguridad] WebSocket sin verificación de propiedad — cualquier usuario puede espiar tracking y chat de pedidos ajenos

**Archivo:** `backend/src/sockets/index.js:101` y `153`

**Beneficio:** Evita que cualquier usuario autenticado espíe coordenadas GPS y mensajes privados de entregas que no le pertenecen.

Los eventos `pedido:seguir` y `chat:unirse` aceptan un `pedido_id` del cliente y hacen `socket.join()` sin ninguna verificación de propiedad. Cualquier rider o negocio autenticado puede unirse al stream de ubicación en tiempo real y al chat de pedidos completamente ajenos.

```js
// ❌ Antes — join sin verificación
socket.on('pedido:seguir', ({ pedido_id }) => {
  if (!pedido_id) return;
  socket.join(`pedido:${pedido_id}`);  // sin verificación de acceso
});

socket.on('chat:unirse', ({ pedido_id }) => {
  if (!pedido_id) return;
  socket.join(`pedido:${pedido_id}`);  // sin verificación de acceso
  const hist = chatHistory.get(pedido_id) || [];
  socket.emit('chat:historial', hist);
});

// ✅ Después — verificar propiedad antes del join
socket.on('pedido:seguir', async ({ pedido_id }) => {
  if (!pedido_id) return;
  const { rows: [pedido] } = await db(
    `SELECT negocio_id, rider_id FROM pedidos WHERE id = $1`, [pedido_id]
  );
  if (!pedido) return;
  const autorizado =
    rol === 'admin' ||
    (rol === 'negocio' && pedido.negocio_id === socket.negocio_id) ||
    (rol === 'rider'   && pedido.rider_id   === socket.rider_id);
  if (!autorizado) return socket.emit('error', { message: 'Sin acceso a este pedido' });
  socket.join(`pedido:${pedido_id}`);
});
// Aplicar la misma verificación a 'chat:unirse'
```

---

## 4. [Rendimiento] Cuatro queries secuenciales en `calcularScore` — paralelizar reduce latencia ~3x

**Archivo:** `backend/src/routes/calificaciones.js:120`

**Beneficio:** Reduce la latencia del cálculo de score en ~3x (de 4 round-trips secuenciales a 1 batch paralelo), mejorando el tiempo de carga del dashboard del rider.

La función `calcularScore` ejecuta 4 queries independientes con `await` secuencial. Las últimas tres (info del rider, pedidos 90 días, pedidos liberados) no tienen dependencia de datos entre sí y esperan innecesariamente el round-trip completo de cada query anterior. Se invoca en cada `GET /mi-score` y `GET /rider/:id/score`.

```js
// ❌ Antes — 4 round-trips secuenciales
const { rows: califs }       = await db(`SELECT ... FROM calificaciones WHERE rider_id = $1`, [riderId]);
const { rows: [rider] }      = await db(`SELECT ... FROM riders WHERE id = $1`, [riderId]);
const { rows: pedidosRider } = await db(`SELECT ... FROM pedidos WHERE rider_id = $1 ...`, [riderId]);
const { rows: liberados }    = await db(`SELECT COUNT(*) ... FROM pedidos WHERE rider_id = $1 ...`, [riderId]);

// ✅ Después — 1 batch paralelo
const [califsResult, riderResult, pedidosResult, liberadosResult] = await Promise.all([
  db(`SELECT tipo, llego_tiempo, fue_amable, bien_presentado, verifico_pedido,
             pedido_buen_estado, lo_recomendaria
      FROM calificaciones WHERE rider_id = $1`, [riderId]),
  db(`SELECT total_entregas, saldo_pendiente FROM riders WHERE id = $1`, [riderId]),
  db(`SELECT estado, asignado_at, entregado_at, created_at
      FROM pedidos WHERE rider_id = $1 AND created_at > NOW() - INTERVAL '90 days'`, [riderId]),
  db(`SELECT COUNT(*) AS total FROM pedidos
      WHERE rider_id = $1 AND estado IN ('cancelado','pendiente') AND asignado_at IS NOT NULL`,
     [riderId]),
]);
const califs       = califsResult.rows;
const rider        = riderResult.rows[0];
const pedidosRider = pedidosResult.rows;
const liberados    = liberadosResult.rows;
```

---

## 5. [UX / Escalabilidad] Endpoints sin paginación devuelven datasets ilimitados — timeout garantizado en producción

**Archivos:** `backend/src/routes/negocios.js:236` y `backend/src/routes/admin.js:222`

**Beneficio:** Limita el tamaño de respuesta y el costo de query independientemente del crecimiento de datos, y entrega al frontend el `total` necesario para controles de paginación.

`GET /api/negocios/clientes` y `GET /api/admin/negocios` ejecutan queries `GROUP BY` sin cláusula `LIMIT`, devolviendo todas las filas históricas en una sola respuesta. Con volumen de producción real, ambos causarán queries progresivamente más lentos y eventualmente timeouts.

```js
// ❌ Antes (negocios.js) — sin límite ni paginación
const { rows } = await db(
  `SELECT c.*, COUNT(p.id) AS pedidos_count, MAX(p.created_at) AS ultimo_pedido
   FROM clientes c
   LEFT JOIN pedidos p ON p.cliente_id = c.id
   WHERE c.negocio_id = $1
   GROUP BY c.id
   ORDER BY MAX(p.created_at) DESC NULLS LAST`,
  [neg.id]
);
res.json(rows);  // sin LIMIT, sin total, sin cursor

// ✅ Después — paginación con LIMIT/OFFSET y total count
router.get('/clientes', auth, solo('negocio'), async (req, res, next) => {
  const { page = 1, limit = 50 } = req.query;
  const limitNum = Math.min(parseInt(limit) || 50, 200);
  const offset   = (Math.max(1, parseInt(page) || 1) - 1) * limitNum;
  try {
    const neg = ...; // búsqueda existente del negocio
    const [{ rows }, { rows: [{ total }] }] = await Promise.all([
      db(
        `SELECT c.*, COUNT(p.id) AS pedidos_count, MAX(p.created_at) AS ultimo_pedido
         FROM clientes c
         LEFT JOIN pedidos p ON p.cliente_id = c.id
         WHERE c.negocio_id = $1
         GROUP BY c.id
         ORDER BY MAX(p.created_at) DESC NULLS LAST
         LIMIT $2 OFFSET $3`,
        [neg.id, limitNum, offset]
      ),
      db(`SELECT COUNT(*) AS total FROM clientes WHERE negocio_id = $1`, [neg.id]),
    ]);
    res.json({ data: rows, total: parseInt(total), page: parseInt(page), limit: limitNum });
  } catch (err) { next(err); }
});
// Aplicar el mismo patrón LIMIT/OFFSET a GET /api/admin/negocios
```

---

*Generado automáticamente por el Agente de Mejoras de RepartoJusto.*
