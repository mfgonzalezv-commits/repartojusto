# Seguridad RepartoJusto
**Última auditoría:** 2026-08-12
**Nivel general:** ALTO → MEDIO tras fixes aplicados
**Health check:** `GET https://repartojusto-production.up.railway.app/health` — ❌ Bloqueado por proxy de egreso del entorno de CI (mismo resultado que auditorías previas). Verificar directamente en Railway dashboard.

---

## Auditoría 2026-08-12

### 1. ALTO — Ubicación GPS del rider expuesta indefinidamente en seguimiento público
**Archivo:** `backend/server.js:129`

El endpoint público `/api/seguimiento/:id` incluye `rider_lat` y `rider_lng` en la respuesta. Esas coordenadas provienen del perfil del rider (se actualizan en tiempo real), no del momento de la entrega. Cualquier persona con el UUID de un pedido ya entregado puede seguir rastreando la posición del rider indefinidamente — incluso días o semanas después de la entrega.

**Fix aplicado:** Se eliminan `rider_lat` y `rider_lng` de la respuesta cuando el pedido está en estado `entregado` o `cancelado`.

---

### 2. ALTO — Verificación manual de JWT en calificaciones no valida cuenta activa
**Archivo:** `backend/src/routes/calificaciones.js:84`

El endpoint `POST /api/calificaciones` para tipo `negocio` verifica el JWT manualmente en lugar de usar el middleware `auth`. Esa verificación manual omitía el chequeo de la flag `activo` en la tabla `usuarios`. Un negocio baneado (con `activo = false`) podía seguir calificando riders mientras su token de 7 días estuviera vigente.

**Fix aplicado:** Se añade una consulta a `usuarios WHERE id = $1` para verificar `activo` antes de permitir la calificación.

---

### 3. ALTO — Race condition en liquidaciones permite doble pago al mismo rider
**Archivo:** `backend/src/routes/admin.js:162`

La consulta `resumen` (suma de tarifas del período) se ejecutaba fuera de la transacción que crea la liquidación. Con dos requests concurrentes al mismo endpoint (dos admins o doble clic), ambas verían `pedidos_count > 0`, pasarían la validación y crearían dos liquidaciones separadas, pagando al rider dos veces y reseteando `saldo_pendiente` dos veces.

**Fix aplicado:** La consulta `resumen` se movió dentro de la transacción. Se agrega una verificación de liquidación duplicada al inicio de la transacción (`SELECT id FROM liquidaciones WHERE rider_id AND fecha_desde AND fecha_hasta`), que lanza un 409 si ya existe.

---

### 4. MEDIO — Rate limiters en memoria sin cleanup crecen indefinidamente
**Archivos:** `backend/src/routes/admin.js:14`, `backend/src/routes/pagos.js:89`, `backend/src/routes/riders.js:63`, `backend/server.js:95`

Todos los rate limiters (excepto el de auth, que usa Redis) almacenan entradas en `Map` sin mecanismo de limpieza. Con muchas IPs únicas, los mapas crecen sin límite hasta consumir memoria del proceso. Un restart del servidor resetea los contadores, anulando la protección.

**Fix pendiente:** Agregar limpieza periódica (`setInterval`) o migrar todos los limiters a Redis como ya hace `auth.js`.

---

### 5. MEDIO — Parámetros `:id` sin validación de formato UUID
**Archivos:** `backend/src/routes/pedidos.js:374`, `backend/src/routes/admin.js:130`, múltiples

Las rutas que usan `:id` como UUID en queries PostgreSQL (`WHERE id = $1`) no validan el formato antes de ejecutar la query. Un request como `GET /api/pedidos/not-a-uuid` genera un error PostgreSQL (`invalid input syntax for type uuid`) que en entorno de desarrollo se expone en la respuesta. En producción el mensaje es genérico, pero la query falla con una excepción innecesaria.

**Fix pendiente:** Agregar middleware de validación UUID en las rutas afectadas:
```javascript
const { param } = require('express-validator');
param('id').isUUID()
```

---

## Fixes aplicados en esta sesión (2026-08-12)

| # | Archivo | Vulnerabilidad | Cambio |
|---|---------|---------------|--------|
| 1 | `backend/server.js` | GPS rider expuesto post-entrega | Eliminar `rider_lat`/`rider_lng` en estados terminales |
| 2 | `backend/src/routes/calificaciones.js` | JWT manual sin chequeo `activo` | Verificar `activo` en DB para calificaciones tipo `negocio` |
| 3 | `backend/src/routes/admin.js` | Race condition en liquidaciones | Mover `resumen` dentro de la transacción + guard duplicado |

---

## Pendiente (al 2026-08-12)

- **Rate limiters en memoria** (admin.js, pagos.js, riders.js, server.js): migrar a Redis o agregar cleanup periódico
- **Validación UUID en params** (pedidos.js, admin.js, etc.): añadir `param('id').isUUID()` middleware
- **Calificaciones cliente**: la ventana de 7 días mitiga el problema; la solución completa requiere un token HMAC firmado en el link de seguimiento para verificar identidad real del cliente
- **VAPID key** (`riders.js`): mover `process.env.VAPID_PUBLIC_KEY` a `src/config/index.js`
- **Production health check**: servidor en Railway sin respuesta — verificar deployment en Railway dashboard

---

## Historial de auditorías

| Fecha | Nivel | Fixes aplicados |
|-------|-------|----------------|
| 2026-07-08 | CRÍTICO → ALTO | Rate limit calificaciones, score protegido, HMAC webhook Flow, CORS config |
| 2026-07-15 | ALTO → MEDIO | Rate limit soporte API, rate limit auth Redis-backed, rate limit seguimiento |
| 2026-07-22 | ALTO → MEDIO | Cap limit paginación, inyección rol historial Claude |
| 2026-07-29 | ALTO → MEDIO | Auth verifica activo DB, rate limit ubicacion rider, mostrar_costo_seguimiento, bug calcularScore |
| 2026-08-05 | ALTO → MEDIO | CORS fatal en prod, ventana 7d calificaciones, rate limit admin, validación admin PUT, rate limit pagos/confirmar |
| 2026-08-12 | ALTO → MEDIO | GPS rider post-entrega, JWT activo en calificaciones, race condition liquidaciones |
