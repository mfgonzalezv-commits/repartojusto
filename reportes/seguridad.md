# Seguridad RepartoJusto
**Última auditoría:** 2026-08-05
**Nivel general:** ALTO → MEDIO tras fixes aplicados
**Health check:** `GET https://repartojusto-production.up.railway.app/health` — ❌ Sin respuesta (connection timeout). Verificar en Railway dashboard.

---

## Auditoría 2026-08-05

### 1. ALTO — CORS configurado con wildcard `*` por defecto
**Archivo:** `backend/src/config/index.js:7`

Si `CORS_ORIGIN` no está definido en producción, el servidor acepta peticiones cross-origin desde cualquier dominio. Cualquier sitio web puede leer respuestas de endpoints públicos (como `/api/seguimiento/:id`) desde el navegador de un usuario, y facilita ataques mixtos junto a otras vulnerabilidades.

**Fix aplicado:** Se lanza un error fatal al iniciar en producción sin `CORS_ORIGIN` (igual que `JWT_SECRET`). En desarrollo local se mantiene `*`.

---

### 2. ALTO — Calificaciones de clientes sin restricción temporal
**Archivo:** `backend/src/routes/calificaciones.js:41`

El endpoint `POST /api/calificaciones` acepta calificaciones tipo `cliente` sin autenticación. El `pedido_id` está expuesto en los links de seguimiento que los negocios envían a clientes. Cualquier persona con ese link podía enviar una calificación falsa al rider en cualquier momento posterior a la entrega — sin límite de tiempo.

**Fix aplicado:** Se verifica que la calificación de tipo `cliente` solo sea válida dentro de los **7 días** posteriores a la entrega. También se agrega `entregado_at` al SELECT de verificación.

---

### 3. ALTO — Sin rate limiting en endpoints de admin
**Archivo:** `backend/src/routes/admin.js:14`

Los endpoints de `/api/admin/*` aplican auth y verificación de rol, pero sin throttling. Varios ejecutan queries costosas con múltiples JOINs y GROUP BY (p.ej. `GET /admin/negocios`, `GET /admin/metricas`). Con un token de admin comprometido, un atacante podía degradar el sistema con llamadas repetidas.

**Fix aplicado:** Rate limiter de **60 req/min por IP** aplicado a todo el router de admin.

---

### 4. MEDIO — Sin validación de entrada en `PUT /api/admin/usuarios/:id`
**Archivo:** `backend/src/routes/admin.js:326`

El endpoint de edición de usuarios no tenía validación con `express-validator`. Un admin podía establecer un email con formato inválido (rompiendo el login) o una contraseña de 1 carácter.

**Fix aplicado:** Validación con express-validator: email válido, password mínimo 6 caracteres, teléfono válido, nombre no vacío.

---

### 5. MEDIO — `GET /api/pagos/confirmar` sin rate limiting
**Archivo:** `backend/src/routes/pagos.js:90`

Endpoint público que modifica estado de pagos en la BD, sin ningún throttling. Permitía intentar tokens mediante fuerza bruta (revelan si existen) y forzar re-verificaciones contra Flow API en loop.

**Fix aplicado:** Rate limiter de **20 req/min por IP** en el endpoint `/confirmar`.

---

## Fixes aplicados en esta sesión (2026-08-05)

| # | Archivo | Vulnerabilidad | Cambio |
|---|---------|---------------|--------|
| 1 | `src/config/index.js` | CORS wildcard en producción | Error fatal si `CORS_ORIGIN` no definido en producción |
| 2 | `src/routes/calificaciones.js` | Sin ventana temporal en ratings cliente | Bloquear calificaciones > 7 días post-entrega |
| 3 | `src/routes/admin.js` | Sin rate limiting en admin | Rate limiter 60 req/min en todo el router admin |
| 4 | `src/routes/admin.js` | Sin validación en PUT /usuarios/:id | express-validator en campos de edición de usuario |
| 5 | `src/routes/pagos.js` | Sin rate limiting en GET /confirmar | Rate limiter 20 req/min en endpoint de confirmación |

---

## Pendiente (al 2026-08-05)

- **Calificaciones cliente**: la ventana de 7 días mitiga el problema; la solución completa requiere un token HMAC firmado en el link de seguimiento para verificar identidad real del cliente
- **VAPID key** (`riders.js`): mover `process.env.VAPID_PUBLIC_KEY` a `src/config/index.js`
- **`notas` en seguimiento público** (`server.js`): evaluar excluir notas internas del response
- **Production health check**: servidor en Railway sin respuesta — verificar deployment

---

## Historial de auditorías

| Fecha | Nivel | Fixes aplicados |
|-------|-------|----------------|
| 2026-07-08 | CRÍTICO → ALTO | Rate limit calificaciones, score protegido, HMAC webhook Flow, CORS config |
| 2026-07-15 | ALTO → MEDIO | Rate limit soporte API, rate limit auth Redis-backed, rate limit seguimiento |
| 2026-07-22 | ALTO → MEDIO | Cap limit paginación, inyección rol historial Claude |
| 2026-07-29 | ALTO → MEDIO | Auth verifica activo DB, rate limit ubicacion rider, mostrar_costo_seguimiento, bug calcularScore |
| 2026-08-05 | ALTO → MEDIO | CORS fatal en prod, ventana 7d calificaciones, rate limit admin, validación admin PUT, rate limit pagos/confirmar |
