# Análisis Interno RepartoJusto
**Fecha:** 2026-11-03 (martes)

## Métricas del sistema
Sin acceso — el proxy de red del entorno de ejecución bloquea conexiones salientes al dominio Railway (403 Forbidden). Análisis basado íntegramente en código fuente.

## Estado de fixes anteriores (verificación del Aprendiz)

| Fix | Estado | Evidencia |
|---|---|---|
| `pagos.js` HMAC webhook Flow | ✅ APLICADO | HMAC con `crypto.timingSafeEqual` en `pagos.js:144-171` |
| `riders.js:224` push_subscription (`req.usuario.id`) | ✅ APLICADO | `req.usuario.id` correcto en línea 224 |
| `pedido:seguir` sin auth (`sockets/index.js:103`) | ❌ PENDIENTE | Ningún guard de acceso antes del `socket.join` |
| `chat:enviar` sin auth (`sockets/index.js:163`) | ❌ PENDIENTE | Sin verificación de pertenencia al pedido |
| Audit trail incentivos (`admin.js:~287`) | ❌ PENDIENTE | INSERT usa columnas inexistentes, `.catch(() => {})` silencia |
| Throttle `rider:ubicacion` | ❌ PENDIENTE | Mejoras.md documenta el fix, el código no lo tiene |
| Índices DB faltantes (flow_token, created_at, entregado_at, hora_retiro) | ❌ PENDIENTE | No están en migrate.js |
| Paginación `/api/admin/liquidaciones` | ❌ PENDIENTE | Sigue con `LIMIT 100` hardcodeado |

## Patrones detectados

### 1. Agente de Mejoras documenta pero no aplica
El git log muestra que los últimos commits a archivos `.js` en `backend/` fueron el **2026-10-29** (solo monitor). Los 8 fixes documentados en `reportes/mejoras.md` existen en ese archivo como código listo para copiar/pegar, pero ninguno fue aplicado al código fuente. El patrón lleva activo desde mayo de 2026.

### 2. Fixes de seguridad críticos sí se aplicaron
Los dos fixes de mayor riesgo (HMAC webhook Flow y push_subscription) sí están en el código. Esto sugiere que los fixes que sí se aplicaron lo hicieron en alguna sesión anterior, pero los operacionales/performance quedaron en limbo.

### 3. Scheduler de pedidos agendados: funcionando
`backend/src/sockets/asignacion.js:265` implementa `setInterval` cada 60 segundos para lanzar pedidos agendados. Sin embargo, falta `idx_pedidos_hora_retiro` — el scheduler hace un `SELECT WHERE estado = 'agendado'` sin índice en hora_retiro, lo que va a ser costoso cuando crezca el volumen.

### 4. `RESIDUAL_PCT: 8` — deuda técnica activa
`config/index.js:52` define `RESIDUAL_PCT: 8`. Búsqueda exhaustiva en todos los archivos `.js` del backend no encontró ninguna referencia activa. La variable existe pero no se usa en ningún cálculo. Requiere decisión de Matías: implementar o eliminar.

### 5. `mostrar_costo_seguimiento` — implementado a medias
El campo existe en la DB (migrate.js), se selecciona en las queries de pedidos (`pedidos.js` y `sockets/index.js`), y se retorna en la API. Pero no hay lógica server-side que filtre datos basada en él — toda la información de costo llega al frontend independientemente del flag. La lógica de ocultamiento tendría que estar en el frontend.

### 6. Throttle GPS ausente — riesgo de carga
`sockets/index.js:67-98`: cada evento `rider:ubicacion` escribe a PostgreSQL inmediatamente. Con 10 riders actualizando cada 2 segundos = 300 writes/min sin throttle. El fix está documentado en mejoras.md sección 4 pero no aplicado.

## Ineficiencias concretas

| Archivo:Línea | Problema | Impacto estimado |
|---|---|---|
| `sockets/index.js:67` | `rider:ubicacion` escribe a PG en cada evento sin throttle | ~300 writes/min con 10 riders activos |
| `sockets/index.js:73-82` | Después de write de ubicación, hace SELECT adicional de pedidos activos del rider — 2 queries por cada evento GPS | Dobla la carga del throttle anterior |
| `admin.js:197` | `LIMIT 100` hardcodeado en `/api/admin/liquidaciones` — no hay paginación | Escalabilidad bloqueada, riesgo de timeout con muchos riders |
| `admin.js:~287` | INSERT INTO pagos con columnas `rider_id`, `tipo`, `metadata` que no existen en el schema — silenciado con `.catch(() => {})` | Audit trail de incentivos completamente roto, sin trazabilidad |
| `sockets/index.js:103` | `pedido:seguir` — join a room sin verificar que el pedido pertenece al usuario | Cualquier usuario autenticado puede escuchar tracking de cualquier pedido |
| `sockets/index.js:163` | `chat:enviar` — sin verificar pertenencia al pedido | Cualquier usuario autenticado puede enviar mensajes a cualquier pedido |
| `migrate.js` | Faltan 4 índices: `idx_pagos_flow_token`, `idx_pedidos_created_at`, `idx_pedidos_entregado_at`, `idx_pedidos_hora_retiro` | Queries lentas en pagos (lookup por token), historial admin, scheduler agendados |

## Oportunidades de mejora basadas en datos

1. **Implementar los 4 índices faltantes** — los índices en `created_at` y `entregado_at` de pedidos afectan las queries de métricas admin (ingresos por día) y del scheduler. Son un ALTER INDEX simple que no requiere downtime.

2. **Throttle GPS a 1 write/5s por rider** — el código de fix ya está en mejoras.md sección 4. Copia directa, impacto ~90% reducción de writes de ubicación.

3. **Cerrar agujero de autorización WebSocket** — `pedido:seguir` y `chat:enviar` sin auth son los únicos vectores de acceso cruzado que quedan. El fix es agregar una query de verificación antes del join/send.

4. **Decidir sobre `RESIDUAL_PCT`** — si no se va a implementar en el corto plazo, eliminar la variable evita confusión. Si sí se implementa, el lugar natural es en `calcularCargos` en `negocios.js`.

## Mensajes para otros agentes

- **PARA MEJORAS:** PRIORIDAD 1 (seguridad): `sockets/index.js:103` — `pedido:seguir` y `sockets/index.js:163` — `chat:enviar` no verifican que el socket pertenece al pedido. Fix: antes del `socket.join`, consultar DB que el pedido pertenece al negocio o rider del socket. PRIORIDAD 2 (performance): aplicar throttle de GPS (`sockets/index.js:67`) — código listo en mejoras.md sección 4. PRIORIDAD 3: agregar a migrate.js los 4 índices faltantes: `idx_pagos_flow_token ON pagos(flow_token)`, `idx_pedidos_created_at ON pedidos(created_at)`, `idx_pedidos_entregado_at ON pedidos(entregado_at)`, `idx_pedidos_hora_retiro ON pedidos(hora_retiro)`. Verificar con `git diff` que los archivos `.js` efectivamente cambian.

- **PARA GERENTE:** HMAC webhook y push_subscription están corregidos (progreso real). Quedan 3 fixes de alta prioridad sin aplicar al código: (1) autorización en WebSocket de tracking/chat — riesgo de privacidad activo; (2) throttle GPS — riesgo de carga en DB bajo presión; (3) 4 índices DB faltantes — afectan scheduler de pedidos agendados y métricas admin. La variable `RESIDUAL_PCT: 8` requiere decisión de Matías: se definió en mayo pero ningún cálculo la usa. El agente de Mejoras sigue documentando sin aplicar al código — patrón de 6 meses.
