# Mejoras RepartoJusto
**Fecha:** 2026-06-15
**Estado:** 5 mejoras identificadas — 2 críticas de seguridad, 1 de rendimiento, 2 de UX/privacidad

---

## 1. [CRÍTICO] Webhook Flow sin verificación de firma HMAC

**Archivo:** `backend/src/routes/pagos.js`, línea 124  
**Beneficio:** Impide que cualquier actor externo marque pagos como completados enviando un POST falso al webhook.

```js
// AGREGAR al inicio del archivo (ya existe require('crypto'))
const verificarFirmaFlow = (req) => {
  const firma = req.headers['x-flow-signature'];
  if (!config.FLOW_SECRET || !firma) return false;
  const esperada = crypto
    .createHmac('sha256', config.FLOW_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(firma, 'hex'),
    Buffer.from(esperada, 'hex')
  );
};

// REEMPLAZAR línea 124 — agregar guard antes de procesar:
router.post('/webhook', async (req, res, next) => {
  if (config.FLOW_ENVIRONMENT !== 'sandbox' && !verificarFirmaFlow(req)) {
    return res.status(401).end();
  }
  const { token } = req.body;
  // ... resto igual
```

---

## 2. [CRÍTICO] Login sin rate limiting — vulnerable a brute force

**Archivo:** `backend/src/routes/auth.js`, línea 100  
**Beneficio:** Bloquea ataques de fuerza bruta en credenciales de negocios, riders y admin.

```js
// AGREGAR al inicio del archivo
const rateLimit = require('express-rate-limit'); // npm i express-rate-limit

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  message: { error: 'Demasiados intentos. Intenta en 15 minutos.' }
});

// REEMPLAZAR línea 100 — agregar loginLimiter como primer middleware:
router.post('/login',
  loginLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  validar,
  async (req, res, next) => {
  // ... resto igual
```

---

## 3. [RENDIMIENTO] Rider escribe en BD en cada actualización GPS

**Archivo:** `backend/src/sockets/index.js`, línea 67  
**Beneficio:** Reduce escrituras a PostgreSQL hasta 10× cuando un rider transmite ubicación cada segundo, sin afectar la fluidez del tracking en tiempo real.

```js
// REEMPLAZAR el handler completo 'rider:ubicacion' (líneas 67–98):
const _lastDbWrite = new Map(); // rider_id → timestamp
const GPS_THROTTLE_MS = 10_000;

socket.on('rider:ubicacion', async ({ lat, lng }) => {
  if (rol !== 'rider' || !socket.rider_id) return;
  if (typeof lat !== 'number' || typeof lng !== 'number') return;

  try {
    const { rows } = await db(
      `SELECT id, negocio_id FROM pedidos
       WHERE rider_id = $1 AND estado IN ('asignado','retiro','en_camino')`,
      [socket.rider_id]
    );

    // Emitir a clientes siempre (sin esperar BD)
    rows.forEach((pedido) => {
      io.to(`negocio:${pedido.negocio_id}`)
        .to(`pedido:${pedido.id}`)
        .emit('rider:ubicacion', {
          rider_id: socket.rider_id,
          pedido_id: pedido.id,
          lat, lng,
          timestamp: Date.now()
        });
    });

    // Escribir en BD solo cada GPS_THROTTLE_MS
    const ahora = Date.now();
    const ultima = _lastDbWrite.get(socket.rider_id) || 0;
    if (ahora - ultima >= GPS_THROTTLE_MS) {
      _lastDbWrite.set(socket.rider_id, ahora);
      await db(
        'UPDATE riders SET lat = $1, lng = $2 WHERE id = $3',
        [lat, lng, socket.rider_id]
      );
    }
  } catch (err) {
    console.error('❌ Error al actualizar ubicación:', err.message);
  }
});
```

---

## 4. [SEGURIDAD/PRIVACIDAD] GET /pedidos/:id expone datos de clientes sin verificar ownership

**Archivo:** `backend/src/routes/pedidos.js`, línea 374  
**Beneficio:** Evita que un rider o negocio ajeno pueda leer el teléfono y dirección de clientes de pedidos que no le corresponden.

```js
// REEMPLAZAR el handler GET /:id completo (líneas 374–392):
router.get('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await db(
      `SELECT p.*,
              n.nombre_comercial, n.direccion AS direccion_retiro,
              n.lat AS neg_lat, n.lng AS neg_lng, n.mostrar_costo_seguimiento,
              u_r.nombre AS rider_nombre, u_r.telefono AS rider_telefono,
              ri.vehiculo_tipo, ri.lat AS rider_lat, ri.lng AS rider_lng
       FROM pedidos p
       JOIN negocios n ON n.id = p.negocio_id
       LEFT JOIN riders ri ON ri.id = p.rider_id
       LEFT JOIN usuarios u_r ON u_r.id = ri.usuario_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });

    const pedido = rows[0];
    const { id: usuarioId, rol } = req.usuario;

    if (rol === 'negocio') {
      const { rows: [neg] } = await db(
        'SELECT id FROM negocios WHERE usuario_id = $1', [usuarioId]
      );
      if (!neg || neg.id !== pedido.negocio_id)
        return res.status(403).json({ error: 'Sin acceso a este pedido' });
    } else if (rol === 'rider') {
      const { rows: [rid] } = await db(
        'SELECT id FROM riders WHERE usuario_id = $1', [usuarioId]
      );
      if (!rid || rid.id !== pedido.rider_id)
        return res.status(403).json({ error: 'Sin acceso a este pedido' });
    }
    // admin: acceso libre

    res.json(pedido);
  } catch (err) { next(err); }
});
```

---

## 5. [UX] Chat en memoria sin persistencia — historial se pierde al reiniciar el servidor

**Archivo:** `backend/src/sockets/index.js`, línea 14  
**Beneficio:** Los mensajes de coordinación entre rider y negocio sobreviven a reinicios del servidor, mejorando la confiabilidad del canal de comunicación en entregas activas.

```js
// REEMPLAZAR la lógica in-memory del chat (líneas 153–172) con persistencia en BD:

// chat:unirse — cargar historial desde BD
socket.on('chat:unirse', async ({ pedido_id }) => {
  if (!pedido_id) return;
  socket.join(`pedido:${pedido_id}`);
  try {
    const { rows } = await db(
      `SELECT desde, nombre, texto, created_at AS hora
       FROM chat_mensajes
       WHERE pedido_id = $1
       ORDER BY created_at ASC
       LIMIT 50`,
      [pedido_id]
    );
    socket.emit('chat:historial', rows);
  } catch {}
});

// chat:enviar — guardar en BD y emitir
const MAX_CHAT_CHARS = 500;
socket.on('chat:enviar', async ({ pedido_id, texto }) => {
  if (!pedido_id || !texto) return;
  const textoLimpio = String(texto).trim().slice(0, MAX_CHAT_CHARS);
  if (!textoLimpio) return;
  const desde = rol === 'rider' ? 'rider' : 'negocio';
  const msg = { desde, nombre, texto: textoLimpio, hora: new Date().toISOString() };

  try {
    await db(
      `INSERT INTO chat_mensajes (pedido_id, desde, nombre, texto)
       VALUES ($1, $2, $3, $4)`,
      [pedido_id, desde, nombre, textoLimpio]
    );
  } catch {}

  io.to(`pedido:${pedido_id}`).emit('chat:mensaje', msg);
});

// Nota: requiere migración:
// CREATE TABLE chat_mensajes (
//   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
//   desde TEXT NOT NULL,
//   nombre TEXT NOT NULL,
//   texto TEXT NOT NULL,
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );
// CREATE INDEX ON chat_mensajes (pedido_id, created_at);
```
