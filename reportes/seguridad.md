# Seguridad RepartoJusto
**Fecha:** 2026-07-01
**Revisado por:** Agente de Seguridad (automatizado)
**Nivel general:** CRÍTICO

---

## Resumen ejecutivo

Se revisaron todos los archivos en `backend/src/routes/` y `backend/src/middleware/`. Se encontraron **5 vulnerabilidades** (1 crítica, 2 altas, 2 medias). Los 3 issues de mayor severidad fueron corregidos directamente en el código.

El endpoint de producción `https://repartojusto-production.up.railway.app/health` devolvió **HTTP 403 Forbidden** — el servidor de producción no está respondiendo correctamente o tiene un problema de acceso.

---

## Vulnerabilidades

---

### 1. CRÍTICO — JWT_SECRET con fallback público en código
**Archivo:** `backend/src/config/index.js:16`

**Qué podía pasar:**
Si la variable de entorno `JWT_SECRET` no está configurada, el sistema usaba el valor literal `'secret_key_change_in_production'`. Este valor es público (visible en el repositorio). Cualquier atacante que lo conociera podía generar tokens JWT válidos con rol `admin` y acceder a todas las rutas del sistema: ver todos los pedidos, liquidar riders, activar/desactivar negocios, enviar emails masivos.

**Fix aplicado:**
```js
// Antes (inseguro):
JWT_SECRET: process.env.JWT_SECRET || 'secret_key_change_in_production',

// Después (falla en producción si no está definido):
JWT_SECRET: process.env.JWT_SECRET ||
  (() => {
    if (NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_SECRET no definido...');
    }
    return 'dev_only_insecure_secret';
  })(),
```

---

### 2. ALTO — Webhook de pagos sin validación de firma
**Archivo:** `backend/src/routes/pagos.js:124`

**Qué podía pasar:**
El endpoint `POST /api/pagos/webhook` (que Flow llama cuando se completa un pago) no verificaba que el request viniera realmente de Flow. Un atacante con un `flow_token` válido (visible en la URL de redirección de pago) podía llamar directamente a este endpoint y forzar al sistema a marcar un pago como completado sin haber pagado realmente. Esto permitiría recibir servicios de delivery sin pagar.

**Fix aplicado:** Se agregó validación HMAC-SHA256 con `crypto.timingSafeEqual()` que bloquea requests sin firma válida cuando `FLOW_ENVIRONMENT !== 'sandbox'`.

---

### 3. ALTO — Sin rate limiting en creación de cuentas
**Archivos:** `backend/src/routes/auth.js:51` (registro negocio), `auth.js:88` (registro rider)

**Qué podía pasar:**
El login tenía rate limiting (10 intentos / 15 min), pero los endpoints de registro no. Un atacante podía crear automáticamente miles de cuentas de negocios o riders, lo que permitiría:
- Registrar riders falsos para interferir con la asignación de pedidos
- Agotar recursos del servidor y la base de datos
- Evadir bloqueos por IP usando nuevas cuentas

**Fix aplicado:** Se refactorizó el rate limiter en una función reutilizable `crearRateLimiter()` y se creó `registroRateLimit` (5 registros / hora / IP), aplicado a ambas rutas de registro.

---

### 4. MEDIO — CORS wildcard permite cualquier origen
**Archivo:** `backend/server.js:49`

**Qué podía pasar:**
```js
app.use(cors({ origin: '*', credentials: false }));
```
Cualquier sitio web en Internet puede hacer peticiones a la API de RepartoJusto desde el navegador del usuario. Si un usuario autenticado (con token JWT guardado en localStorage) visita un sitio malicioso, ese sitio puede usar JavaScript para enviar requests autenticados en nombre del usuario.

**Fix recomendado (no aplicado — requiere conocer el dominio de producción):**
```js
app.use(cors({
  origin: config.CORS_ORIGIN, // ej: 'https://repartojusto.cl'
  credentials: false
}));
```
En `.env` de producción: `CORS_ORIGIN=https://repartojusto.cl`

---

### 5. MEDIO — Endpoint de seguimiento ignora configuración `mostrar_costo_seguimiento`
**Archivo:** `backend/server.js:92-113`

**Qué podía pasar:**
El endpoint público `/api/seguimiento/:id` siempre expone `tarifa_entrega` en la respuesta. Los negocios tienen la opción de ocultar el costo de envío a sus clientes (`mostrar_costo_seguimiento = false`), pero esta configuración es respetada en los endpoints autenticados (`/api/pedidos/:id`) y completamente ignorada en el endpoint de seguimiento público. Clientes que no deberían ver el costo lo ven de todos modos.

**Fix recomendado (no aplicado — requiere ajuste de query):**
```js
// Agregar en la query de seguimiento:
n.mostrar_costo_seguimiento
// Y al serializar la respuesta:
const respuesta = { ...rows[0] };
if (!respuesta.mostrar_costo_seguimiento) delete respuesta.tarifa_entrega;
delete respuesta.mostrar_costo_seguimiento;
res.json(respuesta);
```

---

## Bug crítico corregido (no seguridad, pero causa 500 en producción)

**Archivo:** `backend/src/routes/riders.js:183`

`req.user.id` → `req.usuario.id` (el middleware `auth` expone el usuario como `req.usuario`, no `req.user`). Este typo causaba que el endpoint `POST /api/riders/push-subscription` fallara con 500 para todos los riders, impidiendo recibir notificaciones push de nuevos pedidos.

---

## Fixes aplicados directamente en el código

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `backend/src/config/index.js` | JWT_SECRET: fail-fast en producción si no está definido |
| 2 | `backend/src/routes/auth.js` | Rate limiting en `/registro/negocio` y `/registro/rider` (5/hora/IP) |
| 3 | `backend/src/routes/pagos.js` | Validación HMAC-SHA256 en webhook de Flow (activa en producción) |
| 4 | `backend/src/routes/riders.js` | Fix typo: `req.user.id` → `req.usuario.id` en push-subscription |

## Pendiente (requiere acción manual)

- [ ] **URGENTE:** Verificar que `JWT_SECRET` esté definido en Railway con un valor seguro (mín. 32 chars aleatorios)
- [ ] Restringir `CORS_ORIGIN` al dominio de producción real en variables de entorno de Railway
- [ ] Aplicar fix de `mostrar_costo_seguimiento` en endpoint de seguimiento público
- [ ] **Investigar por qué `https://repartojusto-production.up.railway.app/health` devuelve 403** — posible problema con el deploy actual

## Estado del servidor de producción

```
GET https://repartojusto-production.up.railway.app/health
→ HTTP 403 Forbidden
```

El servidor no está respondiendo correctamente. Posibles causas: deploy fallido, variable de entorno crítica faltante, o problema de red en Railway.
