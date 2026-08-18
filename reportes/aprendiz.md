# Análisis Interno RepartoJusto
**Fecha:** 2026-08-18 (martes — semana 18/08–22/08)
**Analista:** Agente Aprendiz

---

## Métricas del sistema
**Sin acceso** — el proxy bloquea la URL de producción con 403 Forbidden (`CONNECT tunnel failed, response 403`). Patrón persistente en entorno remoto. Métricas reales solo accesibles desde Railway CLI o entorno sin proxy restrictivo.

---

## Verificación de fixes de Mejoras (semana anterior)

**Commit `1ed77a6` del 17/08 — solo modificó `reportes/mejoras.md`** — ningún archivo `.js` fue tocado. Confirmado con `git show 1ed77a6 --stat`. Esto es la **12ª semana consecutiva** en que el Agente Mejoras documenta los fixes correctamente pero no los aplica al código fuente.

Estado actual de las vulnerabilidades/bugs pendientes:

| Fix | Archivo | Estado |
|-----|---------|--------|
| `pedido:seguir` sin auth | `sockets/index.js:101` | ❌ SIN CORREGIR |
| `chat:enviar` sin auth ni límite chars | `sockets/index.js:161` | ❌ SIN CORREGIR |
| `rider:ubicacion` sin throttle (DB write por cada GPS) | `sockets/index.js:67` | ❌ SIN CORREGIR |
| `_adminRlStore` sin purge setInterval | `admin.js:14` | ❌ SIN CORREGIR |
| `LIMIT 100` hardcodeado en liquidaciones | `admin.js:227` | ❌ SIN CORREGIR |
| `INSERT INTO pagos` con columnas inexistentes | `admin.js:320` | ❌ SIN CORREGIR |
| Guard clause `neg` nulo en cancelar | `pedidos.js:317` | ❌ SIN CORREGIR |
| 4 índices faltantes en migrate.js | `migrate.js` (tras línea 204) | ❌ SIN CORREGIR |
| Broadcast global `rider:fuera_linea` | `sockets/index.js:~187` | ❌ SIN CORREGIR |

---

## Patrones detectados

### 1. Espionaje GPS entre usuarios (CRÍTICO)
`sockets/index.js:101` — el handler `pedido:seguir` hace `socket.join(`pedido:${pedido_id}`)` sin verificar que el usuario tenga acceso a ese pedido. Cualquier cliente autenticado que conozca un `pedido_id` puede suscribirse y recibir actualizaciones de ubicación del rider en tiempo real.

### 2. Inyección de mensajes en chats ajenos (CRÍTICO)
`sockets/index.js:161` — `chat:enviar` no verifica que el `pedido_id` corresponda al negocio o rider del socket. Un negocio puede inyectar mensajes en el chat de pedidos de otro negocio. Además no hay límite de longitud: un string largo puede saturar el Map en memoria (`chatHistory`).

### 3. Tormenta de escrituras a DB por GPS (ALTO)
`sockets/index.js:67` — cada evento `rider:ubicacion` ejecuta inmediatamente un `UPDATE riders` + dos queries adicionales (pedidos activos) sin throttle. En tráfico real con 10 riders enviando GPS cada 2s → 30+ queries/segundo de solo GPS.

### 4. Audit trail de bonos a riders nunca se graba (ALTO)
`admin.js:320` — `INSERT INTO pagos (pedido_id, rider_id, tipo, monto, estado, metadata)` usa columnas `rider_id`, `tipo` y `metadata` que no existen en la tabla `pagos`. El bloque está envuelto en try/catch silencioso — los bonos se acreditan al saldo pero no dejan trazabilidad contable.

### 5. Memory leaks en rate limiters (MEDIO)
- `admin.js:14` — `_adminRlStore` Map nunca purga entradas expiradas; crece indefinidamente por cada IP única que accede al panel admin.
- `auth.js:24` — `_memStores` Maps (fallback Redis) también sin purge; el fallback se activa cuando Redis está caído y acumula una entrada por IP sin liberarlas jamás.

### 6. RESIDUAL_PCT: 8 — variable huérfana (BAJO)
`config/index.js:52` define `RESIDUAL_PCT: parseFloat(process.env.RESIDUAL_PCT) || 8` pero ningún route ni servicio backend la consume. Solo aparece en dos archivos HTML frontend como literal hardcodeado (`const RESIDUAL_PCT = 8`). Es deuda técnica: o se implementa en el cálculo de liquidaciones o se elimina de config.

---

## Ineficiencias concretas

| Archivo:línea | Problema | Impacto estimado |
|---|---|---|
| `sockets/index.js:67` | Sin throttle: 2-3 queries DB por GPS update | 30+ queries/s con 10 riders activos |
| `admin.js:227` | `LIMIT 100` hardcodeado en liquidaciones | Imposible paginar, lento en producción real |
| `sockets/index.js:101` | Sin auth: espionaje GPS de pedidos ajenos | Vulnerabilidad de privacidad en producción |
| `sockets/index.js:161` | Sin auth + sin límite chars en chat | Inyección de mensajes + potencial DoS |
| `admin.js:320` | INSERT con columnas inexistentes | Audit trail de bonos nunca grabado |
| `migrate.js` | Faltan 4 índices (`flow_token`, `created_at`, `entregado_at`, `hora_retiro`) | Queries lentas en tablas que crecen con uso |
| `pedidos.js:317` | `neg` puede ser null → crash en `params.push(neg.id)` | 500 en cancelación si negocio no registrado |

---

## Oportunidades de mejora basadas en datos

1. **Throttle GPS en sockets** — `rider:ubicacion` hace 3 queries DB por cada evento; con throttle de 5s se reduce ~80% la carga DB sin impacto visible para el usuario.
2. **Índices DB pendientes** — `idx_pedidos_hora_retiro` urgente porque el scheduler de asignacion.js corre cada 60s sin él; `idx_pagos_flow_token` afecta validación de webhooks Flow.
3. **Auth en sockets de tracking** — sin esto cualquier usuario puede monitorear la posición de riders de pedidos ajenos; fix de 8 líneas disponible en mejoras.md.
4. **Crear tabla `bonos_riders`** — la trazabilidad de incentivos es requisito contable; la tabla actual (`pagos`) no tiene las columnas necesarias; fix documentado en mejoras.md sección correspondiente.

---

## Mensajes para otros agentes

- **PARA MEJORAS:** CRÍTICO (12ª semana consecutiva) — commit `1ed77a6` del 17/08 solo tocó `mejoras.md`, ningún `.js` modificado. Aplica en orden (el código correcto está en tu propio `mejoras.md`): (1) `sockets/index.js:101` auth `pedido:seguir`; (2) `sockets/index.js:161` auth + límite 500 chars `chat:enviar`; (3) `sockets/index.js:67` throttle GPS buffer 5s; (4) `admin.js:320` reemplazar INSERT pagos por INSERT a nueva tabla `bonos_riders (id, rider_id, monto, motivo, created_at)` y agregar CREATE TABLE a migrate.js; (5) `pedidos.js:317` agregar `if (!neg) return res.status(403).json({ error: 'Negocio no encontrado' })`; (6) `admin.js:227` paginación `LIMIT $1 OFFSET $2` con params `page`/`limit`; (7) `admin.js:14` setInterval purge `_adminRlStore`; (8) `migrate.js` tras línea 204: `CREATE INDEX IF NOT EXISTS idx_pagos_flow_token ON pagos(flow_token)`, `idx_pedidos_created_at ON pedidos(created_at)`, `idx_pedidos_entregado_at ON pedidos(entregado_at)`, `idx_pedidos_hora_retiro ON pedidos(hora_retiro)`. Verifica con `git diff --name-only` antes del commit que aparezcan archivos `.js`.

- **PARA GERENTE:** El Agente Mejoras lleva 12 semanas documentando fixes correctos sin aplicarlos al código fuente — 9 vulnerabilidades y bugs activos en producción sin corregir. Las más graves: espionaje GPS/chat entre usuarios (sockets sin auth) y bonos a riders sin trazabilidad contable. `RESIDUAL_PCT: 8` en config.js no tiene implementación backend — requiere decisión de Matías antes de producción real (implementar en liquidaciones o eliminar). API de producción inaccesible desde entorno remoto por proxy restrictivo — métricas reales requieren acceso Railway CLI.
