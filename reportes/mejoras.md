# Mejoras RepartoJusto
**Fecha:** 2026-06-29
**Estado:** 5 mejoras priorizadas — 2 críticas de seguridad, 1 rendimiento, 2 hardening

---

## 1. Webhook de pagos sin verificación de firma HMAC (CRÍTICO)

**Archivo:** `backend/src/routes/pagos.js:124`

**Beneficio:** Impide que cualquier atacante externo confirme pagos falsos enviando un token arbitrario al webhook de Flow.

```javascript
// En pagos.js, reemplazar el inicio del handler del webhook:

// ANTES:
router.post('/webhook', async (req, res, next) => {
  const { token } = req.body;
  if (!token) return res.status(400).end();

// DESPUÉS:
router.post('/webhook', async (req, res, next) => {
  // Verificar firma HMAC enviada por Flow en producción
  const signature = req.headers['x-flow-signature'];
  if (config.FLOW_ENVIRONMENT !== 'sandbox' && config.FLOW_SECRET) {
    if (!signature) return res.status(401).end();
    const expected = crypto
      .createHmac('sha256', config.FLOW_SECRET)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
      return res.status(401).end();
    }
  }
  const { token } = req.body;
  if (!token) return res.status(400).end();
```

---

## 2. Memory leak en rate limiter de login

**Archivo:** `backend/src/routes/auth.js:10`

**Beneficio:** Evita que el `Map` de intentos de login crezca indefinidamente en memoria con cada IP única que contacte el servidor a lo largo del tiempo.

```javascript
// Agregar inmediatamente después de la línea 31 (cierre de loginRateLimit):

// Limpiar entradas expiradas cada 15 minutos para evitar memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now - entry.firstAttempt >= RATE_LIMIT_WINDOW_MS) {
      loginAttempts.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW_MS).unref();
```

---

## 3. Throttle de escrituras de ubicación GPS en tiempo real

**Archivo:** `backend/src/sockets/index.js:67`

**Beneficio:** Reduce hasta 10× las escrituras en PostgreSQL cuando un rider transmite GPS continuamente, sin afectar la fluidez del mapa en tiempo real para negocios y clientes.

```javascript
// Agregar antes de io.on('connection', ...) (línea 32):
const _lastDbWrite = new Map(); // rider_id → timestamp último write
const GPS_THROTTLE_MS = 10_000; // escribir en DB máx. cada 10 segundos

// Dentro del handler 'rider:ubicacion' (línea 67), reemplazar:

// ANTES:
    await db(
      'UPDATE riders SET lat = $1, lng = $2 WHERE id = $3',
      [lat, lng, socket.rider_id]
    );

    // Notificar a pedidos activos del rider (en_camino / retiro)
    const { rows } = await db(...)

    rows.forEach((pedido) => {
      io.to(...).emit('rider:ubicacion', { ... });
    });

// DESPUÉS: emitir siempre, escribir en BD solo cada GPS_THROTTLE_MS
    const { rows } = await db(
      `SELECT id, negocio_id FROM pedidos
       WHERE rider_id = $1 AND estado IN ('asignado','retiro','en_camino')`,
      [socket.rider_id]
    );

    rows.forEach((pedido) => {
      io.to(`negocio:${pedido.negocio_id}`)
        .to(`pedido:${pedido.id}`)
        .emit('rider:ubicacion', { rider_id: socket.rider_id, pedido_id: pedido.id, lat, lng, timestamp: Date.now() });
    });

    const ahora = Date.now();
    if (ahora - (_lastDbWrite.get(socket.rider_id) || 0) >= GPS_THROTTLE_MS) {
      _lastDbWrite.set(socket.rider_id, ahora);
      await db('UPDATE riders SET lat = $1, lng = $2 WHERE id = $3', [lat, lng, socket.rider_id]);
    }
```

---

## 4. Suscripción a tracking sin verificar propiedad del pedido

**Archivo:** `backend/src/sockets/index.js:101`

**Beneficio:** Impide que un negocio o rider autenticado se suscriba al room de tracking de cualquier pedido ajeno y reciba coordenadas GPS en tiempo real sin pertenecer a ese pedido.

```javascript
// ANTES:
socket.on('pedido:seguir', ({ pedido_id }) => {
  if (!pedido_id) return;
  socket.join(`pedido:${pedido_id}`);
});

// DESPUÉS:
socket.on('pedido:seguir', async ({ pedido_id }) => {
  if (!pedido_id) return;
  try {
    if (rol === 'negocio' && socket.negocio_id) {
      const { rows } = await db(
        'SELECT id FROM pedidos WHERE id = $1 AND negocio_id = $2',
        [pedido_id, socket.negocio_id]
      );
      if (!rows[0]) return;
    } else if (rol === 'rider' && socket.rider_id) {
      const { rows } = await db(
        'SELECT id FROM pedidos WHERE id = $1 AND rider_id = $2',
        [pedido_id, socket.rider_id]
      );
      if (!rows[0]) return;
    }
    socket.join(`pedido:${pedido_id}`);
  } catch (err) {
    console.error('❌ Error pedido:seguir:', err.message);
  }
});
```

---

## 5. Mensajes de chat sin límite de longitud

**Archivo:** `backend/src/sockets/index.js:161`

**Beneficio:** Previene que mensajes muy largos inflen el historial en memoria y establece un límite claro de UX para el chat entre negocio y rider.

```javascript
// ANTES:
socket.on('chat:enviar', ({ pedido_id, texto }) => {
  if (!pedido_id || !texto || !String(texto).trim()) return;
  const desde = rol === 'rider' ? 'rider' : 'negocio';
  const msg = { desde, nombre, texto: String(texto).trim(), hora: new Date().toISOString() };

// DESPUÉS:
const MAX_CHAT_TEXTO = 500;

socket.on('chat:enviar', ({ pedido_id, texto }) => {
  if (!pedido_id || !texto || !String(texto).trim()) return;
  const textoProcesado = String(texto).trim().slice(0, MAX_CHAT_TEXTO);
  if (!textoProcesado) return;
  const desde = rol === 'rider' ? 'rider' : 'negocio';
  const msg = { desde, nombre, texto: textoProcesado, hora: new Date().toISOString() };
```

---

*Generado automáticamente por el Agente de Mejoras de RepartoJusto.*
