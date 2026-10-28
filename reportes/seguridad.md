# Seguridad RepartoJusto
**Fecha:** 2026-10-28
**Nivel general:** ALTO
**Agente:** Claude Code (Sonnet 4.6) — sesión automatizada

---

## Vulnerabilidades (revisión semana 43)

### 1. [ALTO] Sin rate limiting en creación de pedidos
**Archivo:** `backend/src/routes/pedidos.js` — línea 22 (antes del fix)  
**Qué podría pasar:** Un negocio autenticado podía crear miles de pedidos por minuto sin ningún límite. Esto habilitaba:  
- Ataque DoS al motor de asignación de riders (cada pedido lanza una cascada de notificaciones en Redis/Socket.io)  
- Spam de pedidos en sandbox sin costo alguno  
- Agotamiento de conexiones PostgreSQL  

**Fix aplicado:** ✅ Rate limiter por `usuario.id`: máximo 20 pedidos por hora. Si se excede, responde HTTP 429.

---

### 2. [ALTO] Null dereference en `GET /api/negocios/pedidos/:id`
**Archivo:** `backend/src/routes/negocios.js` — línea 148  
**Qué podría pasar:** Si un usuario con `rol=negocio` no tiene registro en la tabla `negocios` (inconsistencia de datos, cuenta parcialmente creada), acceder a `GET /api/negocios/pedidos/:id` lanzaba `TypeError: Cannot read properties of undefined (reading 'id')`. Esto resultaba en HTTP 500. En entornos sin `NODE_ENV=production`, el mensaje de error detallado se exponía en la respuesta JSON, filtrando información interna.  
**Fix aplicado:** ✅ Se agregó `if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' })` antes de usar `negocio.id`.

---

### 3. [ALTO] Null dereference en `PUT /api/pedidos/:id/cancelar`
**Archivo:** `backend/src/routes/pedidos.js` — línea 344  
**Qué podría pasar:** El mismo patrón que la vulnerabilidad anterior: si el negocio autenticado no tiene registro en `negocios`, `neg.id` lanzaba TypeError → HTTP 500 con posible fuga de detalles internos.  
**Fix aplicado:** ✅ Se agregó `if (!neg) return res.status(404).json({ error: 'Negocio no encontrado' })` antes de usar `neg.id`.

---

### 4. [MEDIO] Sin validación UUID en `pedido_id` en `POST /api/pagos/crear`
**Archivo:** `backend/src/routes/pagos.js` — línea 44  
**Qué podría pasar:** El campo `pedido_id` solo verifica si es truthy. Un valor como `"'; DROP TABLE pagos; --"` no causa SQL injection (queries parametrizadas lo evitan), pero sí causa un error de tipo PostgreSQL (`invalid input syntax for type uuid`). En non-production, ese mensaje de error se retorna en la respuesta JSON, exponiendo que el backend usa PostgreSQL con tipo UUID.  
**Fix recomendado:** Agregar `body('pedido_id').isUUID()` con express-validator (ya disponible en el proyecto) y la función `validar` al inicio del handler. No aplicado automáticamente para no cambiar la API pública sin revisión.

---

### 5. [MEDIO] JWT `NotBeforeError` no manejado en error handler
**Archivo:** `backend/src/middleware/errorHandler.js` — línea 10  
**Qué podría pasar:** El handler solo captura `JsonWebTokenError` y `TokenExpiredError`. Si se envía un JWT con un claim `nbf` (not before) en el futuro, `jsonwebtoken` lanza `NotBeforeError` que cae al handler genérico → HTTP 500 en lugar de 401. Impacto bajo, pero expone comportamiento inesperado.  
**Fix recomendado:** Agregar `err.name === 'NotBeforeError'` a la condición de la línea 10. Cambio de una línea, no aplicado para mantener batch mínimo de fixes.

---

## Resumen de estado (acumulado)

| # | Fecha | Nivel | Archivo | Estado |
|---|-------|-------|---------|--------|
| 1 | 2026-10-21 | CRÍTICO | pagos.js:147 | ✅ Corregido |
| 2 | 2026-10-21 | ALTO | auth.js:202 | ✅ Corregido |
| 3 | 2026-10-21 | ALTO | admin.js:308 | ✅ Corregido |
| 4 | 2026-10-21 | MEDIO | auth.js:110,150 | ⚠️ Pendiente |
| 5 | 2026-10-21 | BAJO | riders.js:231 | ⚠️ Pendiente |
| 6 | 2026-10-28 | ALTO | pedidos.js:22 | ✅ Corregido |
| 7 | 2026-10-28 | ALTO | negocios.js:148 | ✅ Corregido |
| 8 | 2026-10-28 | ALTO | pedidos.js:344 | ✅ Corregido |
| 9 | 2026-10-28 | MEDIO | pagos.js:44 | ⚠️ Pendiente |
| 10 | 2026-10-28 | MEDIO | errorHandler.js:10 | ⚠️ Pendiente |

## Fixes aplicados esta sesión
- `backend/src/routes/pedidos.js` — Rate limiter en creación de pedidos (max 20/hora por negocio)
- `backend/src/routes/negocios.js` — Null guard en `GET /pedidos/:id`
- `backend/src/routes/pedidos.js` — Null guard en `PUT /:id/cancelar`

## Estado del servidor de producción
- URL: `https://repartojusto-production.up.railway.app/health`
- Resultado: **No alcanzable** (403 desde el proxy del entorno de ejecución). El dominio no resuelve o el servidor sigue sin deployarse.
