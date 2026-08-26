# Seguridad RepartoJusto
**Fecha:** 2026-08-26
**Nivel general:** ALTO

---

## Vulnerabilidades

### 1. ALTO — `backend/src/routes/pedidos.js:32` — `distancia_km` controlado por el cliente

**Qué podría pasar:** El campo `distancia_km` es enviado por el negocio al crear un pedido y se usa directamente para calcular la `tarifa_entrega` que recibe el rider (`$1.100 + $350 × km`). Un negocio puede declarar `distancia_km: 0.1` independientemente de la distancia real. Ejemplo: entrega de 10 km → rider recibe $1.135 en vez de $4.600 (pérdida de $3.465 por pedido).

**Fix exacto aplicado:**
```js
// Después de obtener coordenadas del negocio (lat, lng ahora incluidos en SELECT):
if (lat_entrega != null && lng_entrega != null && negocio.lat != null && negocio.lng != null) {
  const distanciaReal = haversineKm(negocio.lat, negocio.lng, lat_entrega, lng_entrega);
  if (distancia_km < distanciaReal * 0.7) {
    return res.status(400).json({ error: 'Distancia inválida', detalle: '...' });
  }
}
```
✅ **Aplicado en `pedidos.js` — query del negocio amplíada con `lat, lng`; validación cross-check haversine con margen del 30%**

---

### 2. ALTO — `backend/src/routes/pagos.js:105` — `GET /api/pagos/confirmar` sin autenticación

**Qué podría pasar:** El endpoint de confirmación de pago no requería autenticación. En modo sandbox (defecto), `flow.consultarPago()` siempre retorna `status: 2` (pagado). Un negocio podía: (1) crear un pedido y un registro de pago vía `POST /api/pagos/crear` para obtener el `flow_token`, (2) llamar `GET /api/pagos/confirmar?token=X` sin completar ningún pago real, y el sistema marcaba el pago como `'pagado'`. Cualquier tercero que obtuviera el token (logs, historial de navegador) podía triggear la confirmación.

**Fix exacto aplicado:**
```js
// Antes:
router.get('/confirmar', confirmarRateLimit, async (req, res, next) => {
// Después:
router.get('/confirmar', confirmarRateLimit, auth, async (req, res, next) => {
```
✅ **Aplicado en `pagos.js:105` — se añade middleware `auth` al endpoint GET /confirmar**

---

### 3. MEDIO — `backend/src/routes/calificaciones.js:41` — Calificaciones de cliente sin autenticación (reporte anterior)

**Qué podría pasar:** Al calificar como `tipo: 'cliente'`, no se requiere token JWT. Con el UUID del pedido (obtenible del link de seguimiento), cualquiera puede enviar calificaciones negativas masivas contra un rider específico, afectando su score y reduciendo su asignación de pedidos.

**Fix sugerido (no aplicado — requiere decisión de producto):** Generar un token de calificación único al crear el pedido y exigirlo en este endpoint, en lugar de solo el UUID del pedido.

---

### 4. MEDIO — `backend/server.js` y múltiples rutas — Rate limiters in-memory crecen sin cleanup

**Qué podría pasar:** Los `Map` usados para rate limiting (`_adminRlStore`, `_confirmarStore`, `_seguimientoStore`, etc.) nunca eliminan entradas vencidas. Bajo ataque distribuido con miles de IPs distintas, cada solicitud agrega una entrada que permanece indefinidamente en RAM, pudiendo agotar la memoria del proceso y causar crash del servidor (DoS).

**Fix sugerido:**
```js
// Agregar cleanup periódico en cada store:
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of _adminRlStore) {
    if (now - entry.t > 60000) _adminRlStore.delete(key);
  }
}, 5 * 60 * 1000); // cada 5 minutos
```

---

### 5. BAJO — `backend/src/config/index.js:27` — JWT_SECRET débil en entornos no-producción

**Qué podría pasar:** Si el servidor se despliega sin `NODE_ENV=production` (ej. staging, preview, error de configuración), el JWT_SECRET toma el valor literal `'dev_only_insecure_secret'`. Un atacante que conozca este valor puede forjar tokens JWT válidos para cualquier usuario, incluyendo `rol: 'admin'`, obteniendo acceso completo al sistema.

**Fix sugerido:** Exigir `JWT_SECRET` definido siempre, independientemente de `NODE_ENV`:
```js
JWT_SECRET: process.env.JWT_SECRET || (() => {
  throw new Error('FATAL: JWT_SECRET no definido. Configura esta variable de entorno.');
})(),
```

---

## Fixes aplicados (esta sesión — 2026-08-26)

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `backend/src/routes/pedidos.js` | Query negocio incluye `lat, lng`; validación haversine contra `distancia_km` declarada (rechazo si <70% de la real) |
| 2 | `backend/src/routes/pagos.js` | Middleware `auth` agregado a `GET /confirmar` — requiere JWT válido |

## Fixes aplicados (sesión anterior — 2026-08-19)

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `backend/src/routes/soporte.js` | Límite de 1000 caracteres en campo `mensaje` |
| 2 | `backend/src/routes/soporte.js` | Filtro de historial: solo mensajes `user` del cliente (elimina prompt injection) |
| 3 | `backend/server.js` | Content-Security-Policy habilitado con directivas seguras |

---

## Estado del servidor de producción

- URL verificada: `https://repartojusto-production.up.railway.app/health`
- Resultado: **No accesible** desde el entorno de revisión (bloqueado por proxy de red del agente). Estado del servidor no confirmable remotamente.

---

## Áreas sin vulnerabilidades críticas

- **Auth middleware**: JWT + verificación en DB en cada request ✓
- **SQL Injection**: Todas las queries usan parámetros `$1, $2...` ✓
- **Rate limiting**: Implementado en login, registro, admin, soporte, calificaciones, seguimiento ✓
- **Permisos entre roles**: `solo('negocio')`, `solo('rider')`, `solo('admin')` aplicados en cada ruta ✓
- **Webhook Flow**: Firma HMAC validada con `timingSafeEqual`; bloqueado en producción sin `FLOW_SECRET` ✓
- **Ownership de pedidos**: Negocios y riders solo acceden a sus propios pedidos ✓
- **Race condition en aceptación de pedidos**: UPDATE atómico con `WHERE estado = 'pendiente'` previene doble asignación ✓
- **Prompt injection en soporte**: Solo mensajes `user` del historial son reenviados al LLM ✓
