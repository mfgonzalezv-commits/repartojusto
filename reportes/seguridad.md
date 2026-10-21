# Seguridad RepartoJusto
**Fecha:** 2026-10-21
**Nivel general:** CRÍTICO
**Agente:** Claude Code (Sonnet 4.6) — sesión automatizada

---

## Vulnerabilidades

### 1. [CRÍTICO] Webhook de pagos acepta solicitudes sin firma en modo sandbox
**Archivo:** `backend/src/routes/pagos.js` — línea 147  
**Qué podría pasar:** En entornos con `FLOW_ENVIRONMENT=sandbox` y sin `FLOW_SECRET` configurado, cualquier persona que conozca un `flow_token` (visible en las URLs de pago y en la respuesta de `/api/pagos/crear`) puede hacer un POST a `/api/pagos/webhook` y marcar ese pago como completado **sin haber pagado nada**. El helper `consultarPago` en sandbox siempre retorna `status: 2` (pagado), por lo que la forja funciona el 100% de las veces.  
**Fix aplicado:** ✅ Se eliminó la rama que permitía procesar webhooks sin `FLOW_SECRET`. Ahora se rechaza con HTTP 401 siempre que el secreto no esté configurado, independiente del entorno.

---

### 2. [ALTO] Timing attack en login permite enumerar emails registrados
**Archivo:** `backend/src/routes/auth.js` — línea 202  
**Qué podría pasar:** El operador `||` hacía cortocircuito: si el usuario no existía, `bcrypt.compare` nunca se ejecutaba. Eso hace que la respuesta a un email inexistente llegue ~100 ms más rápido que para uno existente. Un atacante puede medir estos tiempos para saber qué emails están registrados en la plataforma y luego enfocar ataques de fuerza bruta o phishing.  
**Fix aplicado:** ✅ Se refactorizó para que `bcrypt.compare` siempre corra, usando un hash dummy cuando el usuario no existe. La respuesta es ahora de tiempo constante.

---

### 3. [ALTO] Sin límite máximo en monto de incentivo para riders
**Archivo:** `backend/src/routes/admin.js` — línea 308  
**Qué podría pasar:** El campo `monto` solo validaba `min: 1`. Una cuenta admin comprometida (o un admin malicioso) podía invocar `POST /api/admin/riders/:id/incentivo` con un monto de, por ejemplo, 9.999.999.999 CLP, acreditando ese saldo al rider sin ninguna restricción del sistema. Esto podría vaciar fondos o generar deuda operativa.  
**Fix aplicado:** ✅ Se agregó `max: 500_000` CLP al validador (equivale a ~500 USD, razonable como bono máximo manual).

---

### 4. [MEDIO] Política de contraseña débil (mínimo 6 caracteres)
**Archivo:** `backend/src/routes/auth.js` — líneas 110 y 150  
**Qué podría pasar:** Las rutas de registro de negocio y rider permiten contraseñas de 6 caracteres. Combinado con el rate limiting solo por IP (no por cuenta), desde múltiples IPs se puede hacer fuerza bruta sobre cuentas con contraseñas cortas.  
**Fix pendiente:** Subir el mínimo a 8 caracteres y agregar al menos un dígito o símbolo (`body('password').isStrongPassword({ minLength: 8, minNumbers: 1 })`). No aplicado automáticamente para evitar romper cuentas existentes — requiere decisión del equipo sobre migración.

---

### 5. [BAJO] VAPID_PUBLIC_KEY expuesta sin autenticación
**Archivo:** `backend/src/routes/riders.js` — línea 231  
**Qué podría pasar:** El endpoint `GET /api/riders/vapid-public-key` devuelve la clave pública VAPID sin requerir token. Aunque la clave pública está diseñada para ser compartida, su exposición sin ningún control facilita que atacantes intenten suscribir dispositivos fantasma a notificaciones push.  
**Fix recomendado:** Proteger el endpoint con `auth` (o al menos limitar con rate limiting por IP). Bajo impacto porque la clave es de naturaleza pública, pero el acceso irrestricto no aporta valor.

---

## Resumen de estado

| # | Nivel | Archivo | Estado |
|---|-------|---------|--------|
| 1 | CRÍTICO | pagos.js:147 | ✅ Corregido |
| 2 | ALTO | auth.js:202 | ✅ Corregido |
| 3 | ALTO | admin.js:308 | ✅ Corregido |
| 4 | MEDIO | auth.js:110,150 | ⚠️ Pendiente (decisión equipo) |
| 5 | BAJO | riders.js:231 | ⚠️ Pendiente |

## Fixes aplicados
- `backend/src/routes/pagos.js` — Webhook ahora requiere FLOW_SECRET siempre
- `backend/src/routes/auth.js` — Login usa bcrypt de tiempo constante
- `backend/src/routes/admin.js` — Incentivo limitado a 500.000 CLP máximo

## Estado del servidor de producción
- URL: `https://repartojusto-production.up.railway.app/health`
- Resultado: **No alcanzable** (DNS ENOTFOUND). El servidor de producción no está levantado o el dominio no está configurado aún.
