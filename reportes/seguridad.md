# Seguridad RepartoJusto
**Fecha:** 2026-09-09
**Nivel general:** MEDIO (después de fixes aplicados esta sesión)

---

## Vulnerabilidades

### 1. ALTO — `backend/src/routes/email.js:7` — Sin validación ni rate limiting en relay de email (NUEVO)

**Qué podría pasar:** El endpoint `POST /api/email/enviar` (admin) aceptaba cualquier valor en `para`, `asunto` y `cuerpo` sin validación de formato ni límites de tamaño. Un administrador comprometido o con malas intenciones podía: (a) enviar emails a cualquier dirección, incluyendo listas de spam; (b) abusar de la cuota de Resend con volúmenes altos; (c) enviar contenido de phishing como si viniera de RepartoJusto. Tampoco había rate limiting, permitiendo vaciar la cuota mensual de la API en segundos.

**Fix exacto aplicado:**
```js
// Validación express-validator en todos los campos
body('para').isEmail().normalizeEmail()
body('asunto').trim().notEmpty().isLength({ max: 200 })
body('cuerpo').trim().notEmpty().isLength({ max: 5000 })

// Rate limiter: máx 10 emails/hora por admin, con cleanup de entradas expiradas
const _emailStore = new Map();
setInterval(() => { /* cleanup */ }, 30 * 60 * 1000).unref();
function emailRateLimit(req, res, next) { /* máx 10/hora por userId */ }
```
✅ **Aplicado en `backend/src/routes/email.js`**

---

### 2. ALTO — Múltiples archivos — Rate limiters in-memory crecen sin límite (carry-over desde 2026-09-02, ahora APLICADO)

**Qué podría pasar:** Los `Map` usados para rate limiting en 7 archivos nunca eliminaban entradas expiradas. Bajo un ataque distribuido con miles de IPs distintas, la RAM crece indefinidamente hasta causar un OOM (out-of-memory) en Railway y reinicio del servidor. Incluso sin ataque, el crecimiento natural en producción agota la RAM en semanas.

**Archivos afectados:** `admin.js:14`, `pagos.js:89`, `riders.js:63`, `calificaciones.js:9`, `server.js:109`, `soporte.js:6`, `auth.js:21`

**Fix exacto aplicado en cada archivo:**
```js
// Patrón aplicado en todos (adaptado por windowMs de cada limiter):
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of theStore) {
    if (now - (e.t ?? e.first ?? e.firstAttempt) >= windowMs) theStore.delete(k);
  }
}, Math.min(windowMs, 5 * 60 * 1000)).unref();
```
✅ **Aplicado en los 7 archivos listados.**

---

### 3. MEDIO — `backend/src/routes/calificaciones.js:99` — JWT verificado manualmente (carry-over)

**Qué podría pasar:** La verificación JWT para calificaciones tipo `negocio` reimplementa manualmente la lógica del middleware `auth`. Si `auth.js` incorpora nuevos controles (2FA, revocación, etc.) en el futuro, esta implementación paralela quedará desactualizada silenciosamente. Un negocio podría calificar con un token que el middleware oficial ya habría rechazado.

**Fix sugerido (no aplicado — requiere extracción de helper exportable):**
Extraer de `auth.js` una función `verifyToken(header)` que retorne `decoded` o lance error, y usarla en `calificaciones.js` en lugar de la implementación manual. Pendiente.

---

### 4. BAJO — `backend/src/config/index.js:22` — JWT_SECRET inseguro fuera de producción (carry-over)

**Qué podría pasar:** Si el servidor corre sin `NODE_ENV=production` (staging, preview, error de configuración), usa `'dev_only_insecure_secret'` como JWT_SECRET. Cualquiera que conozca este valor puede forjar tokens para cualquier usuario, incluyendo `admin`.

**Fix sugerido (no aplicado — requiere coordinación con deployment):**
```js
JWT_SECRET: process.env.JWT_SECRET || (() => {
  throw new Error('FATAL: JWT_SECRET no definido.');
})(),
```
Eliminar la condición `NODE_ENV !== 'production'` para que falle siempre si no está configurado.

---

### 5. BAJO — `backend/src/routes/auth.js:106,144` — Contraseña mínima de 6 caracteres

**Qué podría pasar:** Con solo 6 caracteres de mínimo y rate limiting solo por IP (10 intentos/15 min), un ataque de diccionario distribuido desde múltiples IPs puede comprometer cuentas de negocios que controlan flujos financieros (tarjetas, cobros, pedidos).

**Fix sugerido (no aplicado):**
```js
body('password').isLength({ min: 8 })
  .matches(/^(?=.*[A-Z])(?=.*\d)/) // al menos 1 mayúscula y 1 dígito
```

---

## Fixes aplicados (esta sesión — 2026-09-09)

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `backend/src/routes/email.js` | Validación `isEmail()` en `para`; límites en `asunto` (200) y `cuerpo` (5000 chars); rate limiter 10/hora por admin con cleanup |
| 2 | `backend/src/routes/admin.js` | `setInterval` cleanup del `_adminRlStore` cada 5 min |
| 3 | `backend/src/routes/pagos.js` | `setInterval` cleanup del `_confirmarStore` cada 5 min |
| 4 | `backend/src/routes/riders.js` | `setInterval` cleanup del `_ubicacionStore` cada 5 min |
| 5 | `backend/src/routes/calificaciones.js` | `setInterval` cleanup del `califRateLimitStore` cada 15 min |
| 6 | `backend/server.js` | `setInterval` cleanup del `_seguimientoStore` cada 5 min |
| 7 | `backend/src/routes/soporte.js` | `setInterval` cleanup del `_soporteStore` cada 30 min |
| 8 | `backend/src/routes/auth.js` | `setInterval` cleanup dentro de `crearRateLimiter` para el fallback in-memory |

## Fixes aplicados (sesión anterior — 2026-09-02)

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `backend/server.js` | Genera `calificacion_token` (HMAC-SHA256 del pedido_id) en endpoint `/api/seguimiento/:id` |
| 2 | `backend/src/routes/calificaciones.js` | Valida `calificacion_token` para tipo `'cliente'`; agrega validator `express-validator` para el campo |
| 3 | `backend/src/routes/soporte.js` | Valida que `historial` sea un array antes de operar con `.slice()` y `.filter()` |

## Fixes aplicados (sesión anterior — 2026-08-26)

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `backend/src/routes/pedidos.js` | Validación haversine contra `distancia_km` declarada (rechazo si <70% de la real) |
| 2 | `backend/src/routes/pagos.js` | Middleware `auth` agregado a `GET /confirmar` |

## Fixes aplicados (sesión anterior — 2026-08-19)

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `backend/src/routes/soporte.js` | Límite de 1000 caracteres en campo `mensaje` |
| 2 | `backend/src/routes/soporte.js` | Filtro de historial: solo mensajes `user` del cliente |
| 3 | `backend/server.js` | Content-Security-Policy habilitado con directivas seguras |

---

## Estado del servidor de producción

- URL verificada: `https://repartojusto-production.up.railway.app/health`
- Resultado: **No accesible** desde el entorno de revisión (bloqueado con 403 por proxy de red del agente). Estado de producción desconocido.

---

## Áreas sin vulnerabilidades críticas

- **Auth middleware**: JWT + verificación en DB en cada request ✓
- **SQL Injection**: Todas las queries usan parámetros `$1, $2...` ✓
- **Rate limiting**: Implementado en login, registro, admin, soporte, calificaciones, seguimiento, email ✓
- **Permisos entre roles**: `solo('negocio')`, `solo('rider')`, `solo('admin')` aplicados en cada ruta ✓
- **Webhook Flow**: Firma HMAC validada con `timingSafeEqual`; bloqueado en producción sin `FLOW_SECRET` ✓
- **Ownership de pedidos**: Negocios y riders solo acceden a sus propios pedidos ✓
- **Race condition en aceptación de pedidos**: UPDATE atómico con `WHERE estado = 'pendiente'` ✓
- **Prompt injection en soporte**: Solo mensajes `user` del historial son reenviados al LLM ✓
- **Distancia fraudulenta**: Validación haversine rechaza `distancia_km` subvalorada ✓
- **Rating fraud**: HMAC token derivado del pedido_id protege calificaciones de clientes ✓
- **Relay de email**: Validación + rate limiting en endpoint admin ✓ (nuevo)
- **Memory leak en rate limiters**: Cleanup periódico de entradas expiradas en todos los Maps ✓ (nuevo)
