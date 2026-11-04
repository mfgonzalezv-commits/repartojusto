# Seguridad RepartoJusto
**Fecha:** 2026-11-04
**Nivel general:** ALTO

---

## Vulnerabilidades

### 1. ALTO — Credenciales de pago expuestas en perfil del negocio
**Archivo:** `backend/src/routes/negocios.js` líneas 34 y 97
**¿Qué podía pasar?**
Los endpoints `GET /api/negocios/perfil` y `PUT /api/negocios/perfil` usaban `SELECT n.*` / `RETURNING *`, devolviendo al cliente los campos `tarjeta_token` y `tarjeta_customer_id` almacenados en la base de datos. Si un atacante interceptaba la respuesta (XSS, red insegura, logs mal configurados), podía usar esos tokens para realizar cobros fraudulentos a la tarjeta del negocio.

**Fix aplicado:** Se reemplazó `SELECT n.*` y `RETURNING *` por una lista explícita de campos que excluye `tarjeta_token` y `tarjeta_customer_id`.

---

### 2. ALTO — Claves de push notification expuestas en perfil del rider
**Archivo:** `backend/src/routes/riders.js` línea 15
**¿Qué podía pasar?**
`GET /api/riders/perfil` usaba `SELECT r.*`, retornando el campo `push_subscription` que contiene la URL de endpoint y las llaves de cifrado del Web Push del rider. Con esos datos, un atacante con el JWT del rider podía enviar notificaciones push falsas (p.ej., "nuevo pedido urgente en dirección X") para manipular al rider.

**Fix aplicado:** Se reemplazó `SELECT r.*` por una lista explícita de campos que excluye `push_subscription`.

---

### 3. MEDIO — Sin validación de ownership en `GET /api/pagos/confirmar`
**Archivo:** `backend/src/routes/pagos.js` línea 116 (anterior)
**¿Qué podía pasar?**
El endpoint `GET /api/pagos/confirmar?token=...` aceptaba cualquier `flow_token` sin verificar que el pago perteneciera al negocio autenticado. Un negocio autenticado que obtuviera el `flow_token` de otro negocio (por ejemplo, desde logs o tráfico interceptado en sandbox) podía confirmar pagos ajenos y potencialmente desencadenar activación de pedidos que no le pertenecían.

**Fix aplicado:** Se modificó la consulta SQL para hacer un JOIN con `pedidos` y `negocios`, validando que `negocios.usuario_id = req.usuario.id` antes de retornar el pago.

---

### 4. MEDIO — Falta validación UUID en `POST /api/pagos/crear`
**Archivo:** `backend/src/routes/pagos.js` línea 44 (anterior)
**¿Qué podía pasar?**
`POST /api/pagos/crear` solo verificaba `if (!pedido_id)` sin validar el formato UUID. Enviar strings malformados o extremadamente largos provocaba errores inesperados en PostgreSQL, generando respuestas 500 que en modo desarrollo exponían el mensaje de error interno del servidor (stack trace, nombre de tabla, etc.).

**Fix aplicado:** Se agregó `body('pedido_id').isUUID()` con `express-validator` antes del handler principal.

---

### 5. BAJO — Endpoint VAPID sin autenticación expone variable de entorno
**Archivo:** `backend/src/routes/riders.js` línea 231
**¿Qué podía pasar?**
`GET /api/riders/vapid-public-key` retorna `process.env.VAPID_PUBLIC_KEY` sin requerir autenticación. Si bien las llaves VAPID públicas son diseñadas para ser distribuidas, dejarlas sin auth permite que cualquier persona (sin cuenta) consulte si VAPID está configurado y obtenga la llave para registrar push subscriptions fuera de la app.

**Recomendación (no aplicado):** Añadir el middleware `auth` al endpoint, ya que solo los riders autenticados necesitan la llave VAPID.

---

## Aspectos positivos encontrados
- Todas las queries usan parámetros (`$1`, `$2`) — sin riesgo de SQL injection.
- Login protegido contra timing attacks y enumeración de emails (bcrypt dummy hash).
- Rate limiting implementado en auth, pedidos, admin y pagos.
- Webhook de Flow valida firma HMAC con `crypto.timingSafeEqual` y rechaza si falta `FLOW_SECRET`.
- Error handler en producción oculta mensajes internos (devuelve solo "Error interno del servidor").
- Middleware `auth` verifica activo=true en DB en cada request (previene uso de tokens de cuentas baneadas).

---

## Fixes aplicados

| Archivo | Cambio |
|---|---|
| `backend/src/routes/negocios.js:34` | `SELECT n.*` → campos explícitos sin `tarjeta_token`, `tarjeta_customer_id` |
| `backend/src/routes/negocios.js:97` | `RETURNING *` → campos explícitos sin credenciales de pago |
| `backend/src/routes/riders.js:15` | `SELECT r.*` → campos explícitos sin `push_subscription` |
| `backend/src/routes/pagos.js:116` | Añadido JOIN de ownership en `GET /confirmar` |
| `backend/src/routes/pagos.js:44` | Añadida validación UUID para `pedido_id` |

---

## Estado producción
Endpoint `https://repartojusto-production.up.railway.app/health` no fue accesible desde el entorno de revisión (proxy bloqueó la conexión saliente). Verificar manualmente.
