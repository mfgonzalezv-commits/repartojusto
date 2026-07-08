# Seguridad RepartoJusto
**Fecha:** 2026-07-08
**Nivel general:** ALTO
**Health check:** `GET /health` — sin acceso desde entorno de auditoría (proxy egress bloqueado); confirmar manualmente en Railway.

---

## Vulnerabilidades

### 1. ALTO — Calificaciones de cliente sin autenticación ni rate limiting
**Archivo:** `backend/src/routes/calificaciones.js:37`

Cualquier persona que conozca un `pedido_id` (UUID) puede enviar una calificación negativa anónima a un rider con `tipo: 'cliente'`. Sin rate limiting, un script puede intentar calificar continuamente hasta que la unicidad `(pedido_id, tipo)` lo bloquee. Dado que el pedido_id puede filtrarse por múltiples canales (enlace de seguimiento, socket events) esto afecta directamente la remuneración del rider, cuyo score impacta el volumen de pedidos que recibe.

**Impacto:** Un competidor o cliente malicioso puede hundir el score de cualquier rider.

**Fix aplicado:**
- Rate limiter: 5 intentos por IP cada 15 minutos antes de `POST /api/calificaciones`
- Ver `califRateLimit` en `calificaciones.js:5-22`

---

### 2. ALTO — Score público de riders sin autenticación
**Archivo:** `backend/src/routes/calificaciones.js:247`

`GET /api/calificaciones/rider/:id/score` no requería autenticación. Cualquier tercero puede ver métricas detalladas de comportamiento de cualquier rider: total de cancelaciones, velocidad de entrega, proporción de entregas en horarios valle, feriados trabajados. Esta información es sensible (identifica comportamiento laboral) y no debe ser pública.

**Impacto:** Exposición de datos operacionales de riders que pueden usarse para discriminación o targeting competitivo.

**Fix aplicado:**
- Endpoint ahora requiere `auth` + `solo('admin')`
- Los riders siguen usando `GET /api/calificaciones/mi-score` (ya protegido)

---

### 3. ALTO — Webhook de pagos sin validación de firma en modo sandbox
**Archivo:** `backend/src/routes/pagos.js:124`

El bloque de validación HMAC original solo corría cuando `FLOW_ENVIRONMENT !== 'sandbox'`. En sandbox (modo por defecto), el endpoint `POST /api/pagos/webhook` aceptaba cualquier POST sin verificación. Un negocio podría haber creado un pago (`/api/pagos/crear`) y luego llamado directamente al webhook para marcarlo como 'pagado' sin completar el flujo en Flow.

**Impacto:** Bypass del cobro en sandbox; riesgo de confusión si `FLOW_ENVIRONMENT` se configura incorrectamente al desplegar en producción.

**Fix aplicado:**
- La validación HMAC ahora aplica siempre que `FLOW_SECRET` esté configurado, sin importar el entorno
- Si `FLOW_SECRET` no está configurado en producción: webhook bloqueado con 401
- Si `FLOW_SECRET` no está configurado en sandbox: warning + permite (mantiene compatibilidad de desarrollo)
- Longitud incorrecta en `Buffer.from` atrapada con try/catch para evitar crash en firmas mal formadas

---

### 4. MEDIO — CORS hardcodeado a `*` ignorando la configuración de entorno
**Archivo:** `backend/server.js:49`

El middleware Express CORS estaba hardcodeado a `origin: '*'` a pesar de que `config.CORS_ORIGIN` existe y Socket.io ya lo usaba correctamente. En producción, aunque `CORS_ORIGIN` esté restringido en el entorno, Express seguía aceptando peticiones de cualquier origen.

**Impacto:** Cualquier sitio web puede disparar peticiones autenticadas si logra obtener el token (XSS en el frontend).

**Fix aplicado:**
- `server.js` ahora usa `config.CORS_ORIGIN` para Express (igual que Socket.io)
- Acción requerida en Railway: `CORS_ORIGIN=https://app.repartojusto.cl`

---

### 5. MEDIO — Rate limiter de auth en memoria (no persiste entre instancias)
**Archivo:** `backend/src/routes/auth.js:10-31`

El rate limiter de login/registro usa `new Map()` en memoria del proceso. Con múltiples réplicas o reinicios en Railway, el contador se resetea. Un atacante puede rotar entre instancias o esperar un reinicio para continuar un ataque de fuerza bruta.

**Impacto:** Login de admin o negocio vulnerable a brute force distribuido.

**Fix recomendado (no aplicado — requiere Redis):**
```js
const redis = new Redis(config.REDIS_URL);
const key = `rl:login:${ip}`;
const count = await redis.incr(key);
if (count === 1) await redis.expire(key, windowMs / 1000);
if (count > max) return res.status(429).json({ error: mensaje });
```
Redis ya está en el stack (`config.REDIS_URL`). Migrar cuando se escale a múltiples instancias.

---

## Fixes aplicados

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `calificaciones.js` | Rate limit (5/15min/IP) en `POST /api/calificaciones` |
| 2 | `calificaciones.js` | `GET /rider/:id/score` ahora requiere `auth + solo('admin')` |
| 3 | `pagos.js` | Validación HMAC del webhook aplica cuando `FLOW_SECRET` está configurado, en cualquier entorno |
| 4 | `server.js` | CORS Express usa `config.CORS_ORIGIN` en lugar de `'*'` hardcodeado |

## Pendiente (sin aplicar)

- **Rate limiter Redis** (`auth.js`): migrar cuando se desplieguen múltiples instancias en Railway
- **Variables de entorno en Railway** a configurar:
  - `CORS_ORIGIN=https://app.repartojusto.cl`
  - `FLOW_SECRET=<secreto-flow>` (activa validación webhook en sandbox también)
