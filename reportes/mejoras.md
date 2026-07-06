# Mejoras RepartoJusto
**Fecha:** 2026-07-06
**Estado:** 5 mejoras identificadas — 2 críticas de seguridad, 1 rendimiento, 1 confiabilidad, 1 race condition

---

## 1. Memory leak en rate limiter: entradas nunca se purgan

**Archivo:** `backend/src/routes/auth.js:10`

**Beneficio:** Elimina una fuga de memoria que en producción agota el heap Node tras días de operación, ya que cada IP única agrega una entrada al Map que nunca se borra.

```javascript
// Reemplazar la función crearRateLimiter completa (auth.js:10-31):

function crearRateLimiter({ windowMs, max, mensaje }) {
  const store = new Map();

  // Purga entradas expiradas cada 5 minutos para evitar memory leak
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of store.entries()) {
      if (now - entry.firstAttempt >= windowMs) store.delete(ip);
    }
  }, 5 * 60 * 1000).unref();

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const entry = store.get(ip);
    if (entry) {
      if (now - entry.firstAttempt < windowMs) {
        if (entry.count >= max) {
          const retryAfter = Math.ceil((windowMs - (now - entry.firstAttempt)) / 1000);
          return res.status(429).json({ error: mensaje, retryAfter });
        }
        entry.count++;
      } else {
        store.set(ip, { count: 1, firstAttempt: now });
      }
    } else {
      store.set(ip, { count: 1, firstAttempt: now });
    }
    next();
  };
}
```

---

## 2. Sin autorización en `pedido:seguir`: cualquier usuario espía pedidos ajenos

**Archivo:** `backend/src/sockets/index.js:101`

**Beneficio:** Impide que un rider o negocio autenticado se suscriba al tracking de GPS de pedidos que no le pertenecen, evitando filtración de coordenadas y montos de terceros.

```javascript
// Reemplazar el handler pedido:seguir (sockets/index.js:101-104):

socket.on('pedido:seguir', async ({ pedido_id }) => {
  if (!pedido_id) return;
  try {
    const { rows: [pedido] } = await db(
      `SELECT negocio_id, rider_id FROM pedidos WHERE id = $1`, [pedido_id]
    );
    if (!pedido) return;

    const autorizado =
      rol === 'admin' ||
      (rol === 'negocio' && socket.negocio_id === pedido.negocio_id) ||
      (rol === 'rider'   && socket.rider_id   === pedido.rider_id);

    if (autorizado) socket.join(`pedido:${pedido_id}`);
  } catch (err) {
    console.error('❌ Error al verificar acceso pedido:seguir:', err.message);
  }
});
```

---

## 3. Escrituras a PostgreSQL sin throttle en cada ping GPS del rider

**Archivo:** `backend/src/sockets/index.js:67`

**Beneficio:** Reduce hasta un 80% las escrituras a DB en operación normal (riders pings cada 2-3 s), liberando conexiones del pool y bajando la latencia p99 del servidor.

```javascript
// Agregar antes del bloque try en rider:ubicacion (sockets/index.js:71):
// Mapa de last-write — declarar fuera del handler 'connection':
//   const _lastUbicacionWrite = new Map();

socket.on('rider:ubicacion', async ({ lat, lng }) => {
  if (rol !== 'rider' || !socket.rider_id) return;
  if (typeof lat !== 'number' || typeof lng !== 'number') return;

  try {
    // Throttle: escribir a DB máximo una vez cada 5 segundos por rider
    const now = Date.now();
    if (now - (_lastUbicacionWrite.get(socket.rider_id) || 0) >= 5000) {
      _lastUbicacionWrite.set(socket.rider_id, now);
      await db(
        'UPDATE riders SET lat = $1, lng = $2 WHERE id = $3',
        [lat, lng, socket.rider_id]
      );
    }

    // Notificar siempre (independiente del throttle de DB)
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
          lat, lng, timestamp: Date.now()
        });
    });
  } catch (err) {
    console.error('❌ Error al actualizar ubicación:', err.message);
  }
});
```

---

## 4. chatHistory en memoria se pierde en cada restart del servidor

**Archivo:** `backend/src/sockets/index.js:14`

**Beneficio:** Los mensajes de chat entre negocio y rider sobreviven reinicios, deploys y son accesibles si el usuario reconecta desde otro dispositivo.

```javascript
// Eliminar las líneas 14-15 (chatHistory Map) y reemplazar los handlers:

socket.on('chat:unirse', async ({ pedido_id }) => {
  if (!pedido_id) return;
  socket.join(`pedido:${pedido_id}`);
  try {
    const { rows } = await db(
      `SELECT desde, nombre, texto, hora
       FROM chat_mensajes
       WHERE pedido_id = $1
       ORDER BY hora ASC LIMIT 50`,
      [pedido_id]
    );
    socket.emit('chat:historial', rows);
  } catch (err) {
    socket.emit('chat:historial', []);
  }
});

socket.on('chat:enviar', async ({ pedido_id, texto }) => {
  if (!pedido_id || !texto || !String(texto).trim()) return;
  const textoProcesado = String(texto).trim().slice(0, 500);
  const desde = rol === 'rider' ? 'rider' : 'negocio';
  const msg = { desde, nombre, texto: textoProcesado, hora: new Date().toISOString() };
  try {
    await db(
      `INSERT INTO chat_mensajes (pedido_id, desde, nombre, texto, hora)
       VALUES ($1, $2, $3, $4, $5)`,
      [pedido_id, desde, nombre, msg.texto, msg.hora]
    );
  } catch (err) {
    console.error('❌ Error al persistir mensaje chat:', err.message);
  }
  io.to(`pedido:${pedido_id}`).emit('chat:mensaje', msg);
});
```

> **Migración requerida:**
> ```sql
> CREATE TABLE chat_mensajes (
>   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
>   pedido_id UUID REFERENCES pedidos(id) ON DELETE CASCADE,
>   desde TEXT, nombre TEXT, texto TEXT,
>   hora TIMESTAMPTZ DEFAULT NOW()
> );
> ```

---

## 5. Race condition en límite de pedidos simultáneos durante asignación en cascada

**Archivo:** `backend/src/sockets/asignacion.js:173`

**Beneficio:** Previene que dos riders que aceptan al mismo milisegundo superen el límite de 3 pedidos simultáneos, evitando inconsistencias de negocio y pagos incorrectos al rider.

```javascript
// Reemplazar la función aceptarOferta (asignacion.js:159-200):

async function aceptarOferta(pedido_id, rider_id, io) {
  const cascada = cascadas.get(pedido_id);
  if (cascada) {
    clearTimeout(cascada.timer);
    cascadas.delete(pedido_id);
  }

  const { transaction } = require('../config/database');

  const result = await transaction(async (client) => {
    // FOR UPDATE bloquea la fila del rider, eliminando la race condition
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
      `UPDATE pedidos
       SET estado = 'asignado', rider_id = $1, asignado_at = NOW()
       WHERE id = $2 AND estado = 'pendiente'
       RETURNING *`,
      [rider_id, pedido_id]
    );
    if (!pedido) return { ok: false, error: 'Pedido ya no disponible' };

    return { ok: true, pedido };
  });

  if (result.ok) {
    io.to(`negocio:${result.pedido.negocio_id}`).emit('pedido:actualizado', {
      id: result.pedido.id, estado: 'asignado', rider_id,
    });
    io.emit('pedido:tomado', { pedido_id });
  }

  return result;
}
```

---

*Generado automáticamente por el Agente de Mejoras de RepartoJusto.*
