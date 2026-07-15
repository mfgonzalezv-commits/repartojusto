# Seguridad RepartoJusto
**Última auditoría:** 2026-07-15
**Nivel general:** ALTO → mitigado a MEDIO tras fixes aplicados
**Health check:** `GET /health` — no accesible desde entorno de revisión (proxy egress bloqueado en Railway); verificar manualmente.

---

## Resumen ejecutivo

Segunda auditoría de seguridad. Los cuatro fixes de la auditoría anterior (2026-07-08) están aplicados y verificados en el código. Se encontraron tres nuevas vulnerabilidades — dos ALTO corregidas en esta sesión — y una MEDIO del reporte anterior que ahora también fue corregida.

---

## Auditoría anterior (2026-07-08) — Fixes confirmados en código

| Fix | Archivo | Estado |
|-----|---------|--------|
| Rate limit en `POST /api/calificaciones` | `calificaciones.js:5-22` | ✅ Aplicado |
| `GET /rider/:id/score` requiere `auth + solo('admin')` | `calificaciones.js:251` | ✅ Aplicado |
| Validación HMAC webhook Flow activada con `FLOW_SECRET` | `pagos.js:126-152` | ✅ Aplicado |
| CORS Express usa `config.CORS_ORIGIN` | `server.js:50` | ✅ Aplicado |

---

## Vulnerabilidades — Auditoría 2026-07-15

### 1. ALTO — `POST /api/soporte` sin rate limiting (costos API ilimitados)
**Archivo:** `backend/src/routes/soporte.js:65`

El endpoint de soporte llama a la API de Anthropic en cada request. Sin rate limiting, cualquier usuario autenticado (negocio o rider) puede disparar miles de llamadas por hora, generando costos de API sin límite a cargo de la plataforma.

**Escenario de explotación:** Un negocio registrado ejecuta un script que envía 1 000 requests por hora → costo estimado ~$15 USD/hora en API fees, acumulable indefinidamente.

**Fix aplicado:** Rate limiter de 20 consultas por hora por `usuario_id` (keyed en JWT, no en IP — no eludible con proxies).

```js
// soporte.js — agregado antes del handler
function soporteRateLimit(req, res, next) {
  const userId = req.usuario?.id;
  // ... 20 req / 1h por usuario
}
router.post('/', auth, soporteRateLimit, async (req, res, next) => { ... });
```

---

### 2. ALTO — Rate limiter de login en memoria (bypass garantizado en cada deploy)
**Archivo:** `backend/src/routes/auth.js:10-45`

Los rate limiters de login (10 intentos/15min) y registro (5/hora) usaban `new Map()` en memoria del proceso. Cada deploy en Railway reinicia el servidor y resetea los contadores. Un atacante que monitorea los deploys puede ejecutar brute-force inmediatamente después de cada restart.

**Escenario de explotación:** Se detecta un deploy (app no responde ~2s), se lanza ráfaga de 10 intentos de login sobre cuenta admin, se repite en cada deploy — el bloqueo nunca persiste.

**Fix aplicado:** Rate limiter híbrido: usa Redis (`INCR` + `pExpire`) cuando está disponible; fallback a memoria si Redis no está conectado. El contador persiste entre restarts y funciona en multi-instancia.

```js
// auth.js — ahora usa Redis si REDIS_URL está configurado
if (redisClient?.isReady) {
  const count = await redisClient.incr(`rl:login:${ip}`);
  if (count === 1) await redisClient.pExpire(key, windowMs);
  if (count > max) return res.status(429)...;
}
```

---

### 3. MEDIO — `GET /api/seguimiento/:id` sin rate limiting (scraping de datos)
**Archivo:** `backend/server.js:93`

El endpoint público de seguimiento no tenía ningún límite de requests. Aunque los IDs son UUIDs (difíciles de enumerar), un atacante con un conjunto de `pedido_id`s válidos puede extraer masivamente direcciones de entrega, nombres de riders y posiciones GPS.

**Escenario de explotación:** Filtra pedido_ids de eventos Socket.io (room `pedido:*`), lanza scraping → obtiene directorio de clientes con direcciones.

**Fix aplicado:** Rate limiter de 60 req/min por IP en el endpoint de seguimiento.

---

### 4. MEDIO — Calificaciones tipo 'cliente' sin verificación de identidad
**Archivo:** `backend/src/routes/calificaciones.js:41`

Las calificaciones de tipo `'cliente'` no requieren autenticación — solo un rate limit por IP (5/15min, fácil de evadir con proxies/VPN). Cualquiera que conozca un `pedido_id` de estado `'entregado'` puede enviar una calificación de cliente.

**Escenario de explotación:** Competidor obtiene pedido_ids (p.ej. desde enlace de seguimiento compartido) y califica negativamente a todos los riders del competidor con múltiples IPs.

**Fix recomendado (no aplicado — requiere decisión de producto):** Incluir un token firmado (HMAC del `pedido_id` + secret) en el enlace de seguimiento que se valide al calificar. Esto evita calificaciones de quien no recibió el envío sin requerir cuenta.

---

### 5. BAJO — `GET /api/riders/vapid-public-key` expone variable de entorno sin auth
**Archivo:** `backend/src/routes/riders.js:190`

El endpoint devuelve `process.env.VAPID_PUBLIC_KEY` sin autenticación. La VAPID public key es técnicamente pública (necesaria para suscripciones Web Push), pero exponer variables de entorno directamente es una práctica a evitar.

**Fix recomendado:** Servir la clave desde un archivo estático o desde `src/config/index.js` en lugar de leer `process.env` directamente en el handler.

---

## Fixes aplicados en esta sesión (2026-07-15)

| # | Archivo | Vulnerabilidad | Cambio |
|---|---------|---------------|--------|
| 1 | `src/routes/soporte.js` | Sin rate limiting en API de Anthropic | Rate limiter 20/hora por usuario |
| 2 | `src/routes/auth.js` | Rate limiter en memoria (bypass en restart) | Rate limiter Redis-backed con fallback a memoria |
| 3 | `server.js` | Sin rate limiting en seguimiento público | Rate limiter 60/min por IP |

## Pendiente

- **Calificaciones cliente** (`calificaciones.js`): decidir si implementar token de seguimiento firmado
- **VAPID key** (`riders.js:190`): mover a `config/index.js` en lugar de `process.env` directo
- **Acción en Railway**: confirmar que `REDIS_URL` está configurado para activar el rate limiter Redis en auth
