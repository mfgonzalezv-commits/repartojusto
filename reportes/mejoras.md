# Mejoras RepartoJusto
**Fecha:** 2026-07-20
**Estado:** 5 mejoras identificadas — 1 bug de crash crítico (nuevo), 2 de seguridad, 1 rendimiento, 1 UX

---

## 1. [Bug Crítico] Crash en `PUT /pedidos/:id/cancelar` cuando negocio sin registro

**Archivo:** `backend/src/routes/pedidos.js:317`

**Beneficio:** Evita un TypeError no manejado que devuelve 500 con stack trace en lugar de un 404 limpio.

Si el usuario tiene rol `negocio` pero no existe fila en la tabla `negocios` (cuenta corrompida, registro eliminado), `neg` es `undefined` y `neg.id` lanza `TypeError: Cannot read properties of undefined`. La excepción no es capturada dentro del bloque `if` y escapa al error handler.

```js
// ❌ Antes (línea 314-320) — crash si neg es undefined
if (req.usuario.rol === 'negocio') {
  const { rows: [neg] } = await db(
    'SELECT id FROM negocios WHERE usuario_id = $1', [req.usuario.id]
  );
  params.push(neg.id);  // TypeError si neg === undefined
  filtro += ` AND negocio_id = $${params.length}`;
}

// ✅ Después — guard clause antes de acceder a neg.id
if (req.usuario.rol === 'negocio') {
  const { rows: [neg] } = await db(
    'SELECT id FROM negocios WHERE usuario_id = $1', [req.usuario.id]
  );
  if (!neg) return res.status(404).json({ error: 'Negocio no encontrado' });
  params.push(neg.id);
  filtro += ` AND negocio_id = $${params.length}`;
}
```

---

## 2. [Seguridad] Chat sin control de acceso al pedido  *(pendiente desde 2026-07-13)*

**Archivo:** `backend/src/sockets/index.js:161`

**Beneficio:** Impide que cualquier usuario autenticado inyecte mensajes en el chat de pedidos ajenos.

El evento `chat:enviar` no verifica que el socket pertenezca al negocio o rider del pedido antes de publicar el mensaje. Cualquier usuario autenticado puede enviar mensajes a `pedido:{cualquier_id}`.

```js
// REEMPLAZAR el handler chat:enviar (línea 161):

socket.on('chat:enviar', async ({ pedido_id, texto }) => {
  if (!pedido_id || !texto || !String(texto).trim()) return;

  try {
    const { rows } = await db(
      `SELECT p.id FROM pedidos p
       WHERE p.id = $1
         AND (
           (p.negocio_id = $2 AND $3 = 'negocio')
           OR (p.rider_id = $4 AND $3 = 'rider')
           OR $3 = 'admin'
         )`,
      [pedido_id, socket.negocio_id || null, rol, socket.rider_id || null]
    );
    if (!rows[0]) return; // sin acceso: ignorar silenciosamente
  } catch { return; }

  const desde = rol === 'rider' ? 'rider' : 'negocio';
  const msg = { desde, nombre, texto: String(texto).trim().slice(0, 500), hora: new Date().toISOString() };

  if (!chatHistory.has(pedido_id)) chatHistory.set(pedido_id, []);
  const hist = chatHistory.get(pedido_id);
  hist.push(msg);
  if (hist.length > MAX_CHAT_MSG) hist.shift();

  io.to(`pedido:${pedido_id}`).emit('chat:mensaje', msg);
});
```

---

## 3. [Seguridad] `pedido:seguir` sin verificación de acceso — espionaje de tracking GPS  *(pendiente desde 2026-07-13)*

**Archivo:** `backend/src/sockets/index.js:101`

**Beneficio:** Evita que cualquier usuario autenticado espíe coordenadas GPS y datos de pedidos ajenos en tiempo real.

El evento `pedido:seguir` hace `socket.join()` sin comprobar que el socket tenga relación con ese pedido específico.

```js
// REEMPLAZAR el handler pedido:seguir (líneas 101-104):

socket.on('pedido:seguir', async ({ pedido_id }) => {
  if (!pedido_id) return;
  if (rol === 'admin') { socket.join(`pedido:${pedido_id}`); return; }
  try {
    const { rows: [pedido] } = await db(
      `SELECT negocio_id, rider_id FROM pedidos WHERE id = $1`, [pedido_id]
    );
    if (!pedido) return;
    const autorizado =
      (rol === 'negocio' && socket.negocio_id === pedido.negocio_id) ||
      (rol === 'rider'   && socket.rider_id   === pedido.rider_id);
    if (autorizado) socket.join(`pedido:${pedido_id}`);
  } catch (err) {
    console.error('❌ Error al verificar acceso pedido:seguir:', err.message);
  }
});
```

---

## 4. [Rendimiento] Ubicación del rider genera 2 queries/seg por rider sin throttle  *(pendiente desde 2026-07-13)*

**Archivo:** `backend/src/sockets/index.js:67`

**Beneficio:** Reduce hasta un 80% las escrituras a PostgreSQL sin degradar la experiencia de tracking visual en el mapa.

Con riders enviando GPS cada 1-2 segundos, el handler actual ejecuta un `UPDATE riders` + un `SELECT pedidos` en cada evento. Con 20 riders activos esto supone ~40 queries/seg solo para ubicaciones.

```js
// Declarar fuera del bloque io.on('connection') — una sola vez:
const _lastUbicacionWrite = new Map();

// REEMPLAZAR el handler rider:ubicacion (líneas 67-98):
socket.on('rider:ubicacion', async ({ lat, lng }) => {
  if (rol !== 'rider' || !socket.rider_id) return;
  if (typeof lat !== 'number' || typeof lng !== 'number') return;

  try {
    const now = Date.now();
    // Throttle: escribir coordenadas a DB máximo cada 5 segundos
    if (now - (_lastUbicacionWrite.get(socket.rider_id) || 0) >= 5000) {
      _lastUbicacionWrite.set(socket.rider_id, now);
      await db(
        'UPDATE riders SET lat = $1, lng = $2 WHERE id = $3',
        [lat, lng, socket.rider_id]
      );
    }

    // Notificar siempre en tiempo real (independiente del throttle de DB)
    const { rows } = await db(
      `SELECT id, negocio_id FROM pedidos
       WHERE rider_id = $1 AND estado IN ('asignado','retiro','en_camino')`,
      [socket.rider_id]
    );
    rows.forEach((pedido) => {
      io.to(`negocio:${pedido.negocio_id}`)
        .to(`pedido:${pedido.id}`)
        .emit('rider:ubicacion', {
          rider_id: socket.rider_id, pedido_id: pedido.id,
          lat, lng, timestamp: now
        });
    });
  } catch (err) {
    console.error('❌ Error al actualizar ubicación:', err.message);
  }
});
```

---

## 5. [Seguridad] Rate limiter de login en memoria — memory leak en entradas expiradas  *(pendiente desde 2026-07-13)*

**Archivo:** `backend/src/routes/auth.js:10`

**Beneficio:** El límite de intentos de login sobrevive reinicios y funciona correctamente en despliegues multi-proceso (cluster/PM2).

El `Map` en memoria se vacía en cada reinicio del servidor, permitiendo evadir el bloqueo con un simple restart. Además el mapa nunca purga entradas expiradas (memory leak a largo plazo).

```js
// REEMPLAZAR la función crearRateLimiter (líneas 10-31):
// Requiere el cliente Redis ya disponible en el proyecto (config/redis.js o similar)

function crearRateLimiter({ windowMs, max, mensaje, prefix }) {
  // Fallback en memoria si Redis no está disponible
  const store = new Map();
  let redisClient = null;
  try { redisClient = require('../config/redis'); } catch { /* usar Map */ }

  // Purga periódica del fallback en memoria
  setInterval(() => {
    const now = Date.now();
    for (const [ip, e] of store.entries()) {
      if (now - e.firstAttempt >= windowMs) store.delete(ip);
    }
  }, 5 * 60 * 1000).unref();

  return async (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const key = `rl:${prefix}:${ip}`;

    if (redisClient) {
      try {
        const count = await redisClient.incr(key);
        if (count === 1) await redisClient.pexpire(key, windowMs);
        if (count > max) {
          const ttl = await redisClient.pttl(key);
          return res.status(429).json({ error: mensaje, retryAfter: Math.ceil(ttl / 1000) });
        }
        return next();
      } catch { /* Redis falló: caer al Map en memoria */ }
    }

    // Fallback Map
    const now = Date.now();
    const entry = store.get(ip);
    if (entry && now - entry.firstAttempt < windowMs) {
      if (entry.count >= max) {
        const retryAfter = Math.ceil((windowMs - (now - entry.firstAttempt)) / 1000);
        return res.status(429).json({ error: mensaje, retryAfter });
      }
      entry.count++;
    } else {
      store.set(ip, { count: 1, firstAttempt: now });
    }
    next();
  };
}
```

---

*Generado automáticamente por el Agente de Mejoras de RepartoJusto.*
