# Análisis Interno RepartoJusto
**Fecha:** 2026-07-14
**Agente:** Aprendiz (análisis semanal)

---

## Métricas del sistema
Sin acceso — proxy del entorno bloquea conexiones a railway.app (HTTP 403). Patrón consistente con reportes del Monitor. Los datos de esta semana son exclusivamente de análisis de código.

---

## Estado de bugs y fixes identificados en semanas anteriores

### ✅ CORREGIDOS (verificados en código)
| Bug | Archivo | Estado |
|-----|---------|--------|
| push-subscription `req.user.id` vs `req.usuario.id` | `riders.js:183` | ✅ Corregido — ya usa `req.usuario.id` |
| Webhook Flow sin validación HMAC | `pagos.js:122-152` | ✅ Corregido — firma HMAC implementada con `timingSafeEqual` |

### ❌ PENDIENTES — documentados en mejoras.md pero NO aplicados al código

El patrón confirmado por `git log` sigue activo: el commit de Mejoras del 13/07 (`7b3a7d8`) solo tocó `reportes/mejoras.md`. El código fuente no fue modificado. Los 5 fixes restantes siguen sin llegar a producción.

| # | Archivo:Línea | Problema | Severidad |
|---|---------------|----------|-----------|
| 1 | `auth.js:10-31` | Rate limiter usa `Map` sin purge — memory leak en producción con tráfico real | CRÍTICA |
| 2 | `admin.js:188-201` | `LIMIT 100` hardcodeado en `/api/admin/liquidaciones` — no hay paginación | MEDIA |
| 3 | `sockets/index.js:67-98` | `rider:ubicacion` escribe a DB en cada evento GPS — 2 queries/segundo por rider activo sin throttle | ALTA |
| 4 | `sockets/index.js:101-104` | `pedido:seguir` hace `socket.join()` sin verificar que el socket tenga relación con ese pedido — cualquier usuario autenticado espía coordenadas GPS ajenas | CRÍTICA |
| 5 | `sockets/index.js:161` | `chat:enviar` sin verificación de acceso — cualquier usuario autenticado inyecta mensajes en chats de pedidos ajenos | CRÍTICA |

---

## Ineficiencias concretas

### 1. Rate limiter sin purge — memory leak en auth.js
**Archivo:** `backend/src/routes/auth.js:10-31`
- La función `crearRateLimiter` usa un `Map` en memoria que nunca se limpia.
- Cada IP nueva agrega una entrada. En tráfico sostenido el Map crece indefinidamente.
- **Impacto:** Crash de producción por OOM en el primer pico de tráfico real.
- **Fix (1 línea):** Agregar `setInterval(() => { const now = Date.now(); store.forEach((v, k) => { if (now - v.firstAttempt > windowMs) store.delete(k); }); }, windowMs)` dentro de la función, después de `const store = new Map()`.

### 2. rider:ubicacion genera 2 queries/seg por rider sin throttle
**Archivo:** `backend/src/sockets/index.js:67-98`
- Cada evento `rider:ubicacion` del frontend hace UPDATE + SELECT a la DB.
- Con 5 riders activos y GPS cada 500ms = 20 queries/seg innecesarios.
- **Fix:** Cache de última escritura por rider_id en Map + skip si han pasado menos de 5s desde la última escritura a DB.

### 3. Índices de BD faltantes
**Archivo:** `backend/scripts/migrate.js` (después de línea 205)
- Cuatro índices identificados desde mayo no están en el migration file:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_pagos_flow_token ON pagos(flow_token);
  CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON pedidos(created_at);
  CREATE INDEX IF NOT EXISTS idx_pedidos_entregado_at ON pedidos(entregado_at);
  CREATE INDEX IF NOT EXISTS idx_pedidos_hora_retiro ON pedidos(hora_retiro);
  ```
- El scheduler de pedidos agendados corre cada 60s sobre `pedidos.hora_retiro` sin índice.
- **Impacto:** Full table scan en cada iteración del scheduler en producción.

### 4. RESIDUAL_PCT desconectado del backend
**Archivo:** `backend/src/config/index.js:46` y `backend/public/rider.html:2061`
- `RESIDUAL_PCT: 8` existe en config como variable configurable, pero ningún cálculo de backend la referencia.
- En `rider.html` el valor está hardcodeado como `const RESIDUAL_PCT = 8` (línea 2061), ignorando el config.
- **Impacto:** Si Matías cambia el residual en `.env`, el backend no lo aplica y el frontend tampoco lo refleja.
- **Decisión requerida:** ¿Se implementa el cálculo de residual en liquidaciones o se elimina la variable de config?

---

## Patrones detectados

1. **Agente Mejoras genera código correcto pero no lo aplica** — patrón confirmado en 4 commits consecutivos (ver cola.md 30/06, 07/07, 13/07). Los fixes existen como texto en mejoras.md pero nunca llegan al repo. Esto requiere intervención de Matías para cambiar el protocolo del agente.

2. **Dos vulnerabilidades de acceso cruzado en sockets siguen abiertas** — `pedido:seguir` y `chat:enviar` permiten a cualquier usuario autenticado espiar o contaminar pedidos ajenos. El Agente Mejoras generó el código correcto el 13/07 pero no lo aplicó.

3. **Proxy bloquea acceso a railway.app** — todos los agentes con acceso externo (Monitor, Aprendiz) están limitados a análisis local. Sin acceso a métricas reales de producción desde el entorno remoto.

---

## Oportunidades de mejora basadas en evidencia

1. **Corregir las 3 vulnerabilidades de sockets en una sesión** — evidencia: código del fix ya existe en mejoras.md del 13/07, son copiar/pegar en `sockets/index.js`.

2. **Agregar purge al rate limiter** — evidencia: 1 setInterval, previene crash en producción antes de que llegue tráfico real.

3. **Agregar los 4 índices a migrate.js** — evidencia: el scheduler de pedidos agendados ya corre en producción sin el índice `hora_retiro`, generando full table scans cada 60 segundos.

4. **Implementar paginación en /api/admin/liquidaciones** — evidencia: con el volumen de pedidos proyectado la respuesta crecerá hasta timeout; fix es reemplazar `LIMIT 100` por `LIMIT $1 OFFSET $2`.

5. **Decidir sobre RESIDUAL_PCT** — evidencia: la variable existe en config y en rider.html (hardcodeada) pero nunca se usa en un cálculo de backend real. Si la tarifa residual existe como modelo de negocio, necesita implementarse en el módulo de liquidaciones.

---

## Mensajes para otros agentes

- **PARA MEJORAS:** URGENTE — 5 fixes documentados en tu reporte del 13/07 NO fueron aplicados al código (commit 7b3a7d8 solo tocó mejoras.md). Prioridad: (1) `sockets/index.js:101` autorización `pedido:seguir` — cualquier usuario espía GPS ajeno; (2) `sockets/index.js:161` autorización `chat:enviar` — cualquier usuario inyecta mensajes en chats ajenos; (3) `auth.js:10-31` memory leak rate limiter — agregar setInterval purge; (4) `admin.js:197` reemplazar `LIMIT 100` por `LIMIT $1 OFFSET $2`; (5) agregar a `migrate.js` tras línea 205: 4 índices pendientes (`idx_pagos_flow_token`, `idx_pedidos_created_at`, `idx_pedidos_entregado_at`, `idx_pedidos_hora_retiro`). El código correcto ya está en mejoras.md — solo falta aplicarlo al archivo real.

- **PARA GERENTE:** El patrón de Mejoras que genera código correcto pero no lo aplica al repo lleva 4 semanas activo. Las 3 vulnerabilidades de acceso cruzado en sockets (espionaje de GPS, inyección de mensajes en chat) siguen abiertas en producción. `RESIDUAL_PCT: 8` en config.js no tiene implementación en backend — requiere decisión de Matías antes de pasar a modo producción con negocios reales.
