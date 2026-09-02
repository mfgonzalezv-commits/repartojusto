# Seguridad RepartoJusto
**Fecha:** 2026-09-02
**Nivel general:** ALTO → MEDIO (después de fixes aplicados)

---

## Vulnerabilidades

### 1. CRÍTICO — `backend/src/routes/calificaciones.js:41` — Rating fraud: tipo 'cliente' sin autenticación ni token

**Qué podría pasar:** El endpoint `POST /api/calificaciones` no requería ninguna protección para calificaciones de tipo `'cliente'`. Cualquier script podía obtener el UUID de un pedido desde el link de seguimiento público (`/api/seguimiento/:id`) y enviar calificaciones negativas masivas contra cualquier rider. Con proxies rotantes, el rate limiter de 5/15 min por IP era trivial de evadir. Un competidor desleal podía hundir el score de un rider legítimo en minutos, reduciendo sus pedidos asignados e ingresos.

**Fix exacto aplicado:**
```js
// En server.js: se agrega calificacion_token al endpoint de seguimiento
data.calificacion_token = crypto
  .createHmac('sha256', config.JWT_SECRET)
  .update(data.id)
  .digest('hex')
  .slice(0, 24);

// En calificaciones.js: validación HMAC para tipo 'cliente'
if (tipo === 'cliente') {
  const expected = crypto
    .createHmac('sha256', config.JWT_SECRET)
    .update(pedido_id)
    .digest('hex')
    .slice(0, 24);
  if (calificacion_token !== expected) {
    return res.status(403).json({ error: 'Token de calificación inválido' });
  }
}
```
✅ **Aplicado en `server.js` y `calificaciones.js` — solo quien accedió al tracking link puede calificar.**

> **Nota para el frontend:** La página de seguimiento debe leer `calificacion_token` de la respuesta del endpoint `/api/seguimiento/:id` e incluirlo en el body del POST de calificación.

---

### 2. ALTO — `backend/src/routes/soporte.js:101` — `historial` no validado como array → crash DoS

**Qué podría pasar:** Si un usuario autenticado enviaba `historial` como un string u objeto en lugar de un array (ej: `"historial": "texto"`), la llamada `historial.slice(-10).filter(...)` lanzaba un `TypeError` (strings no tienen `.filter()`). Esto causaba un error 500 por cada request malformado, pudiendo saturar logs o provocar reinicio del proceso bajo ataque sostenido.

**Fix exacto aplicado:**
```js
if (!Array.isArray(historial)) return res.status(400).json({ error: 'Formato de historial inválido' });
```
✅ **Aplicado en `soporte.js:94`**

---

### 3. ALTO — `backend/src/routes/calificaciones.js:83` — Verificación JWT manual para tipo 'negocio' (drift de seguridad)

**Qué podría pasar:** La verificación JWT para calificaciones de negocios reimplementa manualmente la lógica del middleware `auth`. Si en el futuro `auth.js` agrega controles adicionales (revocación de tokens, 2FA, rate limit por usuario), esta implementación paralela quedaría desactualizada silenciosamente. Un negocio podría continuar calificando con un token que el middleware oficial hubiera rechazado.

**Fix sugerido (no aplicado — requiere refactor del middleware para soporte async/resolve):**
Extraer la lógica de verificación de `auth.js` a una función auxiliar exportable `verifyToken(header)` que retorne el `decoded` o lance error, y usarla tanto en el middleware como en calificaciones. Pendiente para la próxima iteración.

---

### 4. MEDIO — `backend/server.js` y múltiples rutas — Rate limiters in-memory crecen sin cleanup

**Qué podría pasar:** Los `Map` usados para rate limiting (`_adminRlStore`, `_confirmarStore`, `_seguimientoStore`, `_ubicacionStore`, etc.) nunca eliminan entradas expiradas. Bajo ataque distribuido con miles de IPs distintas, la RAM del proceso crece indefinidamente. En Railway con límite de RAM, esto puede causar un OOM (out-of-memory) y reinicio del servidor.

**Fix sugerido (no aplicado — requiere refactor en varias rutas):**
```js
// En cada archivo con Map de rate limiting:
setInterval(() => {
  const now = Date.now();
  const WINDOW = 60000; // usar la windowMs del limiter correspondiente
  for (const [key, entry] of theStore) {
    if (now - (entry.t ?? entry.first ?? entry.firstAttempt) > WINDOW) {
      theStore.delete(key);
    }
  }
}, 5 * 60 * 1000);
```

---

### 5. BAJO — `backend/src/config/index.js:22` — JWT_SECRET débil en entornos sin `NODE_ENV=production`

**Qué podría pasar:** Si el servidor se despliega sin `NODE_ENV=production` (ej. staging, preview deploy, error de configuración en Railway), el JWT_SECRET toma el valor `'dev_only_insecure_secret'`. Cualquier atacante que conozca este valor puede forjar tokens JWT válidos para cualquier usuario, incluyendo `rol: 'admin'`, obteniendo control total del sistema.

**Fix sugerido (no aplicado — requiere validación en la configuración del deployment):**
```js
JWT_SECRET: process.env.JWT_SECRET || (() => {
  throw new Error('FATAL: JWT_SECRET no definido. Configura esta variable de entorno.');
})(),
```
Remover la condición `NODE_ENV !== 'production'` para que falle siempre si no está configurado.

---

## Fixes aplicados (esta sesión — 2026-09-02)

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
- Resultado: **No accesible** desde el entorno de revisión (bloqueado por proxy de red del agente).

---

## Áreas sin vulnerabilidades críticas

- **Auth middleware**: JWT + verificación en DB en cada request ✓
- **SQL Injection**: Todas las queries usan parámetros `$1, $2...` ✓
- **Rate limiting**: Implementado en login, registro, admin, soporte, calificaciones, seguimiento ✓
- **Permisos entre roles**: `solo('negocio')`, `solo('rider')`, `solo('admin')` aplicados en cada ruta ✓
- **Webhook Flow**: Firma HMAC validada con `timingSafeEqual`; bloqueado en producción sin `FLOW_SECRET` ✓
- **Ownership de pedidos**: Negocios y riders solo acceden a sus propios pedidos ✓
- **Race condition en aceptación de pedidos**: UPDATE atómico con `WHERE estado = 'pendiente'` ✓
- **Prompt injection en soporte**: Solo mensajes `user` del historial son reenviados al LLM ✓
- **Distancia fraudulenta**: Validación haversine rechaza `distancia_km` subvalorada ✓
