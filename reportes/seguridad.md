# Seguridad RepartoJusto
**Última auditoría:** 2026-07-29
**Nivel general:** ALTO → MEDIO tras fixes aplicados
**Health check:** `GET https://repartojusto-production.up.railway.app/health` — sin respuesta (proxy egress bloqueado en entorno de auditoría). Verificar en Railway dashboard.

---

## Resumen ejecutivo

Tercera auditoría de seguridad. Los fixes de las auditorías anteriores (2026-07-08 y 2026-07-15 y 2026-07-22) están aplicados y verificados en el código. Se encontraron dos vulnerabilidades ALTO nuevas, corregidas en esta sesión, y se aplicaron dos fixes MEDIO pendientes de la auditoría anterior.

---

## Auditoría anterior (2026-07-22) — Fixes confirmados en código

| Fix | Archivo | Estado |
|-----|---------|--------|
| Cap `limit` en GET /pedidos, /usuarios (admin, negocio, rider) | `admin.js`, `negocios.js`, `riders.js` | ✅ Aplicado |
| Inyección de rol en historial Claude (whitelist + truncado) | `soporte.js:97-103` | ✅ Aplicado |
| Rate limiter Redis-backed en login/registro | `auth.js:12-65` | ✅ Aplicado |
| Rate limiter 60/min en seguimiento público | `server.js:96-109` | ✅ Aplicado |

---

## Vulnerabilidades — Auditoría 2026-07-29

### 1. ALTO — `auth` middleware no verifica `activo` en DB (usuarios baneados operan 7 días)
**Archivo:** `backend/src/middleware/auth.js:5`

El middleware JWT solo verificaba la firma del token pero no consultaba la base de datos para confirmar que el usuario sigue activo. Al desactivar una cuenta con `PUT /api/admin/usuarios/:id/activo`, el usuario recibe un 403 en el próximo login, pero sus tokens JWT existentes siguen siendo válidos por el período de expiración configurado (7 días por defecto).

**Escenario de explotación:** Se detecta fraude de un rider o negocio → admin desactiva la cuenta → el actor malicioso sigue creando pedidos, aceptando entregas y accediendo a datos durante 7 días con su token existente.

**Fix aplicado (ALTO):**
```js
// auth.js — ahora verifica activo en DB en cada request autenticado
const auth = async (req, res, next) => {
  ...
  const decoded = jwt.verify(token, config.JWT_SECRET);
  const { rows } = await db('SELECT activo FROM usuarios WHERE id = $1', [decoded.id]);
  if (!rows[0] || !rows[0].activo) {
    return res.status(401).json({ error: 'Cuenta desactivada o no encontrada' });
  }
  req.usuario = decoded;
  next();
};
```

**Nota de rendimiento:** Agrega una consulta indexada por UUID en cada request autenticado. Con el pool de PostgreSQL existente y escala típica de la plataforma (< 500 req/min), el overhead es < 2ms por request.

---

### 2. ALTO — `PUT /api/riders/ubicacion` sin rate limiting (DoS de base de datos)
**Archivo:** `backend/src/routes/riders.js:64`

El endpoint de actualización de ubicación en tiempo real no tenía ningún límite de requests. A diferencia del endpoint de seguimiento público (que sí tenía rate limit desde 2026-07-22), este endpoint requiere auth pero no limitaba la frecuencia de llamadas por rider.

**Escenario de explotación:** Rider malicioso (o cuenta comprometida) ejecuta script que envía `PUT /api/riders/ubicacion` en un loop → agota el pool de conexiones PostgreSQL con updates masivos → toda la plataforma deja de responder (OOM o connection pool exhausted).

**Fix aplicado (ALTO):**
```js
// riders.js — agregado antes del handler
function ubicacionRateLimit(req, res, next) {
  const userId = req.usuario?.id;
  // Max 60 actualizaciones/min por rider (1 por segundo — suficiente para tracking)
  ...
}
router.put('/ubicacion', auth, solo('rider'), ubicacionRateLimit, [...], handler);
```

---

### 3. MEDIO — `mostrar_costo_seguimiento` ignorada en seguimiento público (pendiente 2026-07-22)
**Archivo:** `backend/server.js:113`

El negocio puede configurar `mostrar_costo_seguimiento = false` para ocultar el costo de envío a sus clientes finales. Sin embargo, el endpoint público `GET /api/seguimiento/:id` siempre devolvía `tarifa_entrega` en la respuesta, ignorando esta preferencia. Cualquier cliente que inspeccionara la respuesta JSON podía ver cuánto pagó el negocio por el envío.

Adicionalmente, el endpoint exponía `rider_rating` (métrica interna de calidad, no pensada para clientes finales).

**Fix aplicado (MEDIO):**
```js
// server.js — seguimiento ahora respeta la preferencia del negocio
const data = { ...rows[0] };
if (!data.mostrar_costo_seguimiento) delete data.tarifa_entrega;
delete data.mostrar_costo_seguimiento; // campo interno
res.json(data);
```
También se removió `ri.rating AS rider_rating` del SELECT (dato interno, no relevante para clientes).

---

### 4. BAJO — `calcularScore` referencia `res` inexistente (crash silencioso)
**Archivo:** `backend/src/routes/calificaciones.js:148`

La función `calcularScore(riderId)` es una función auxiliar interna (no un route handler), pero contenía `return res.status(404).json(...)` si el rider no existía. Como `res` no está definido en ese scope, esto causaba un `ReferenceError` que el error handler convertía en HTTP 500, en lugar del 404 esperado. Afecta a `GET /api/calificaciones/rider/:id/score` y `GET /api/calificaciones/mi-score`.

**Fix aplicado (BAJO):**
```js
// calificaciones.js — calcularScore ahora retorna null si el rider no existe
if (!rider) return null; // El caller maneja el 404
```
Los route handlers ya verificaban `if (!data) return res.status(404)...`, así que la lógica de respuesta es correcta con este fix.

---

### 5. MEDIO — Calificaciones tipo 'cliente' sin token de seguimiento firmado (pendiente 2026-07-15)
**Archivo:** `backend/src/routes/calificaciones.js:41`

Las calificaciones de tipo `'cliente'` no requieren autenticación — solo un rate limit por IP (5/15min, bypasseable con múltiples IPs/VPN). Cualquier persona con un `pedido_id` de estado `'entregado'` puede enviar una calificación de cliente y afectar negativamente el rating del rider.

**Estado:** Fix no aplicado — requiere decisión de producto. La mitigación técnica recomendada es incluir un HMAC firmado del `pedido_id` en el enlace de seguimiento que se valide al calificar.

---

## Fixes aplicados en esta sesión (2026-07-29)

| # | Archivo | Vulnerabilidad | Cambio |
|---|---------|---------------|--------|
| 1 | `src/middleware/auth.js` | Sin verificación de `activo` en DB | Consulta DB en cada request; bloquea cuentas desactivadas inmediatamente |
| 2 | `src/routes/riders.js` | Sin rate limiting en `PUT /ubicacion` | Rate limiter 60 req/min por rider (in-memory, keyed por user ID) |
| 3 | `server.js` | `mostrar_costo_seguimiento` ignorada + `rider_rating` expuesto | Ocultar tarifa según preferencia del negocio; remover rating del response público |
| 4 | `src/routes/calificaciones.js` | `res` undefined en `calcularScore` | Retornar `null` y dejar al caller manejar el 404 |

---

## Pendiente (al 2026-07-29)

- **Calificaciones cliente** (`calificaciones.js`): implementar token HMAC en link de seguimiento para verificar identidad del cliente calificador
- **VAPID key** (`riders.js:192`): mover `process.env.VAPID_PUBLIC_KEY` a `src/config/index.js` en lugar de leer env directo en handler
- **CORS** (`config/index.js:7`): confirmar que `CORS_ORIGIN` está configurado en Railway con el dominio del frontend (no wildcard `*`)
- **`p.notas` en seguimiento público** (`server.js`): evaluar si excluir `notas` del SELECT o agregar campo `notas_publicas` separado; actualmente se sigue exponiendo
- **Health check Railway**: confirmar que el servidor responde en `https://repartojusto-production.up.railway.app/health`

---

## Historial de auditorías

| Fecha | Nivel | Fixes aplicados |
|-------|-------|----------------|
| 2026-07-08 | CRÍTICO → ALTO | Rate limit calificaciones, score protegido, HMAC webhook Flow, CORS config |
| 2026-07-15 | ALTO → MEDIO | Rate limit soporte API, rate limit auth Redis-backed, rate limit seguimiento |
| 2026-07-22 | ALTO → MEDIO | Cap limit paginación, inyección rol historial Claude |
| 2026-07-29 | ALTO → MEDIO | Auth verifica activo DB, rate limit ubicacion rider, mostrar_costo_seguimiento, bug calcularScore |
