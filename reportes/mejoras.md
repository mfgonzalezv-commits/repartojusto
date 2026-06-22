# Mejoras RepartoJusto
**Fecha:** 2026-06-22
**Estado:** 5 mejoras identificadas — 1 bug activo que rompe push notifications, 3 vulnerabilidades de seguridad, 1 de rendimiento

---

## 1. Bug activo: `req.user` debería ser `req.usuario` — rompe push subscriptions de riders

**Archivo:** `backend/src/routes/riders.js`, línea 183
**Beneficio:** Corrige un `TypeError` en producción que impide que los riders registren su suscripción Web Push, dejándolos sin notificaciones de nuevos pedidos.

```js
// ACTUAL (línea 183) — lanza TypeError: Cannot read properties of undefined:
[JSON.stringify(subscription), req.user.id]

// CORRECTO — el middleware auth.js usa req.usuario, no req.user:
[JSON.stringify(subscription), req.usuario.id]
```

---

## 2. Seguridad: Webhook de Flow acepta POSTs sin verificar firma HMAC

**Archivo:** `backend/src/routes/pagos.js`, línea 124
**Beneficio:** Impide que un atacante marque pagos como completados enviando un token válido al webhook sin haber pagado realmente.

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

## 3. Seguridad: Login sin rate limiting — vulnerable a fuerza bruta

**Archivo:** `backend/src/routes/auth.js`, línea 100
**Beneficio:** Bloquea ataques de fuerza bruta sobre credenciales de negocios, riders y admin con solo agregar un middleware estándar.

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

## 4. Seguridad: JWT_SECRET con valor débil hardcodeado como fallback

**Archivo:** `backend/src/config/index.js`, línea 16
**Beneficio:** Evita que el servidor arranque en producción con un secreto JWT conocido públicamente que permitiría forjar tokens de cualquier usuario.

```js
// ACTUAL (línea 16) — arranque silencioso con secreto débil:
JWT_SECRET: process.env.JWT_SECRET || 'secret_key_change_in_production',

// CORRECTO — lanzar error en inicio si no está configurado:
JWT_SECRET: (() => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET no configurado en variables de entorno');
  }
  return process.env.JWT_SECRET;
})(),
```

---

## 5. Rendimiento: Rider escribe en PostgreSQL en cada actualización GPS

**Archivo:** `backend/src/sockets/index.js`, línea 67
**Beneficio:** Reduce escrituras a PostgreSQL hasta 10× cuando riders transmiten ubicación cada segundo, sin afectar la fluidez del mapa en tiempo real para los negocios.

```js
// REEMPLAZAR el handler 'rider:ubicacion' completo (líneas 67–98):
const _lastDbWrite = new Map(); // rider_id → timestamp
const GPS_THROTTLE_MS = 10_000; // escribir en BD máximo cada 10s

socket.on('rider:ubicacion', async ({ lat, lng }) => {
  if (rol !== 'rider' || !socket.rider_id) return;
  if (typeof lat !== 'number' || typeof lng !== 'number') return;

  try {
    const { rows } = await db(
      `SELECT id, negocio_id FROM pedidos
       WHERE rider_id = $1 AND estado IN ('asignado','retiro','en_camino')`,
      [socket.rider_id]
    );

    // Emitir a clientes siempre — sin esperar escritura en BD
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
