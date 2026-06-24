# Seguridad RepartoJusto
**Fecha:** 2026-06-24
**Nivel general:** CRÍTICO

---

## Vulnerabilidades

### 1. CRÍTICO — Riders pueden cancelar cualquier pedido de la plataforma
**Archivo:** `backend/src/routes/pedidos.js:302`

El endpoint `PUT /api/pedidos/:id/cancelar` solo aplica `auth` pero no restringe el rol. Un rider autenticado puede cancelar cualquier pedido activo de cualquier negocio. La lógica interna solo agrega filtro de ownership para el rol `negocio`; para cualquier otro rol (incluido `rider`) no hay restricción.

**¿Qué pasa si se explota?**
Un rider malintencionado cancela masivamente pedidos de negocios competidores o sabotea operaciones completas de la plataforma.

**Fix aplicado:**
```diff
- router.put('/:id/cancelar', auth,
+ router.put('/:id/cancelar', auth, solo('negocio', 'admin'),
```

---

### 2. CRÍTICO — Calificaciones de negocio sin autenticación + catch vacío silencia tokens falsos
**Archivo:** `backend/src/routes/calificaciones.js:54`

`POST /api/calificaciones` no requiere autenticación. Cualquier persona sin cuenta puede enviar calificaciones. Peor aún, el bloque `try {} catch {}` silenciaba tokens JWT inválidos o malformados, permitiendo bypasear la verificación de propiedad enviando un header Authorization con basura.

**¿Qué pasa si se explota?**
Un atacante destruye el rating de cualquier rider enviando calificaciones negativas masivas, o un competidor manipula rankings sin tener cuenta.

**Fix aplicado:**
- Cuando `tipo === 'negocio'`: se exige token JWT válido y se verifica ownership del pedido.
- El `catch {}` vacío fue reemplazado por `catch (jwtErr) { return res.status(401)... }`.
- Calificaciones `tipo === 'cliente'` (tracking anónimo) siguen permitidas sin auth.

---

### 3. ALTO — IDOR: cualquier usuario autenticado ve cualquier pedido
**Archivo:** `backend/src/routes/pedidos.js:374`

`GET /api/pedidos/:id` aplica `auth` pero no verifica si el pedido pertenece al usuario que consulta. Un rider puede consultar pedidos de cualquier negocio y acceder a nombre/teléfono del cliente, dirección, tarifas y datos financieros.

**¿Qué pasa si se explota?**
Un rider registrado enumera pedidos por UUID y extrae bases de datos de clientes (nombres, teléfonos, direcciones) de todos los negocios de la plataforma.

**Fix aplicado:**
```
rol === 'negocio' → solo ve pedidos de su negocio
rol === 'rider'   → solo ve pedidos donde es el rider asignado
rol === 'admin'   → ve todos
```

---

### 4. ALTO — Sin rate limiting en login (fuerza bruta)
**Archivo:** `backend/src/routes/auth.js:99`

El endpoint `POST /api/auth/login` no tiene ningún límite de intentos. Un atacante puede probar millones de combinaciones de contraseñas contra cualquier email conocido.

**¿Qué pasa si se explota?**
Con el hash bcrypt (cost 10) el ataque es lento pero viable contra contraseñas débiles. Un admin o negocio con contraseña `123456` puede ser comprometido en minutos.

**Fix aplicado:**
Rate limiter en memoria: máximo 10 intentos por IP cada 15 minutos. Responde `429` con `retryAfter` en segundos.

> Para producción: reemplazar con `express-rate-limit` + Redis para persistencia entre reinicios.

---

### 5. ALTO — Webhook de pagos sin verificación de firma
**Archivo:** `backend/src/routes/pagos.js:123`

`POST /api/pagos/webhook` acepta cualquier request sin verificar que provenga realmente de Flow. Solo valida que el `token` exista en la DB, pero no verifica firma HMAC.

**¿Qué pasa si se explota?**
En producción (con Flow real), un atacante que conoce o adivina un `flow_token` puede marcar un pago como completado sin haber pagado. En sandbox el impacto es nulo, pero el código irá a producción.

**Fix pendiente (requiere configuración):**
```javascript
// En server.js, antes de app.use('/api/pagos', pagoRoutes):
// app.use('/api/pagos/webhook', express.raw({ type: 'application/json' }));

// En pagos.js:
const crypto = require('crypto');
const verificarFirmaFlow = (req, res, next) => {
  const secret = process.env.FLOW_WEBHOOK_SECRET;
  if (!secret) return next(); // sandbox: sin secreto configurado, pasar
  const firma = req.headers['x-flow-signature'];
  const esperada = crypto.createHmac('sha256', secret)
    .update(JSON.stringify(req.body)).digest('hex');
  if (firma !== esperada) return res.status(401).end();
  next();
};
// Agregar como primer middleware en router.post('/webhook', verificarFirmaFlow, ...)
```

---

## Estado del servidor en producción

`GET https://repartojusto-production.up.railway.app/health`
→ **Inaccesible desde el entorno de CI** (proxy de red retorna 403 Forbidden).
El servidor podría estar activo pero la conexión saliente al dominio railway.app está bloqueada por la política de red del contenedor de ejecución.

---

## Fixes aplicados directamente al código

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `backend/src/routes/pedidos.js:302` | Agregado `solo('negocio', 'admin')` a `PUT /:id/cancelar` |
| 2 | `backend/src/routes/calificaciones.js:54` | Autenticación obligatoria para `tipo='negocio'`; catch vacío eliminado |
| 3 | `backend/src/routes/pedidos.js:374` | Check de ownership por rol en `GET /:id` |
| 4 | `backend/src/routes/auth.js:99` | Rate limiter en memoria (10 intentos / 15 min / IP) en `POST /login` |

**Fix 5 (webhook)** documentado pero no aplicado — requiere que el equipo configure `FLOW_WEBHOOK_SECRET` en Railway antes de activar.
