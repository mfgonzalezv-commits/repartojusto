# Análisis Interno RepartoJusto
**Fecha:** 2026-08-04 (martes — semana 04/08–08/08)
**Analista:** Agente Aprendiz

---

## Métricas del sistema
**Sin acceso** — el proxy bloquea la URL de producción con 403 Forbidden (confirmado: `CONNECT tunnel failed, response 403`). Igual que las semanas anteriores. Métricas reales solo accesibles desde un entorno sin proxy restrictivo o mediante Railway CLI directo.

---

## Verificación de tareas asignadas (semana 28/07)

### 1. ¿Mejoras aplicó los 5 fixes al código fuente?
**NEGATIVO — 10ª semana consecutiva del mismo patrón.**

Último commit del Agente Mejoras: `ecdccd6` (2026-08-03) — solo tocó `reportes/mejoras.md`.
Ningún archivo `.js` fue modificado por Mejoras esta semana ni la anterior.

Estado actual verificado directamente en el código fuente:

| Fix | Archivo:Línea | Estado |
|-----|--------------|--------|
| `pedido:seguir` sin auth | `sockets/index.js:101` | **ABIERTO** |
| `chat:enviar` sin auth | `sockets/index.js:161` | **ABIERTO** |
| INSERT pagos columnas inexistentes (bonos) | `admin.js:294` | **ABIERTO** |
| Guard `neg` nulo en cancelar | `pedidos.js:317` | **ABIERTO** |
| Throttle `rider:ubicacion` | `sockets/index.js:67` | **ABIERTO** |
| Memory leak rate limiter | `auth.js:24-65` | **ABIERTO** |
| Paginación LIMIT 100 liquidaciones | `admin.js:201` | **ABIERTO** |
| 4 índices faltantes en migrate.js | `migrate.js` tras línea 204 | **ABIERTO** |

### 2. ¿`RESIDUAL_PCT: 8` está implementado en algún cálculo?
**NO.** La variable está definida en `backend/src/config/index.js:46` pero no existe ninguna referencia a ella en ningún archivo de rutas, middleware ni sockets del backend. Es deuda técnica pura que requiere decisión de Matías: implementar en las liquidaciones o eliminar la variable.

### 3. ¿`mostrar_costo_seguimiento` fue implementado?
**SÍ — completamente implementado.** Esta tarea se confirma cerrada (ya confirmada la semana del 28/07). No hay novedades.

---

## Patrones detectados

### A. Agente Mejoras: bloqueo estructural confirmado (10ª semana)
El commit `ecdccd6` del 03/08 confirma que el Agente Mejoras sigue el mismo patrón documentado desde la semana del 23/06: genera código correcto en su reporte pero no lo aplica al código fuente. Han pasado 10 semanas. El reporte de esta semana incluso añadió un bug nuevo (DoS por longitud de mensaje en chat) pero tampoco aplicó el fix.

### B. Vulnerabilidades de sockets activas en producción
Los eventos `pedido:seguir` y `chat:enviar` no verifican propiedad del pedido (confirmado en `sockets/index.js`):
- `pedido:seguir` (línea 101): cualquier usuario autenticado puede hacer join al room de cualquier pedido y recibir coordenadas GPS en tiempo real.
- `chat:enviar` (línea 161): clasifica al emisor como `rider` o `negocio` según `rol` pero no verifica que el pedido le pertenezca — cualquier rider puede inyectar mensajes en chats ajenos.

### C. Admin audit trail silenciado — bonos riders sin trazabilidad
`admin.js:294` ejecuta:
```sql
INSERT INTO pagos (pedido_id, rider_id, tipo, monto, estado, metadata)
```
Las columnas `rider_id`, `tipo` y `metadata` no existen en la tabla `pagos` (confirmado en migrate.js — la tabla solo tiene: `id, pedido_id, flow_order_id, flow_token, monto, estado, pagado_at, created_at, updated_at`). El `.catch(() => {})` en línea 299 silencia el error. Resultado: cada bono acreditado a un rider no deja ningún registro auditable.

### D. Nuevo bug identificado por Mejoras esta semana (no aplicado)
`sockets/index.js:162` — el campo `texto` en `chat:enviar` no tiene límite de longitud. Un actor malicioso puede enviar mensajes de tamaño arbitrario que llenan el `chatHistory` Map en memoria. El código del fix existe en `mejoras.md` sección 1 — no fue aplicado.

### E. Carga DB por GPS sin throttle
`rider:ubicacion` ejecuta 2 queries DB por cada evento GPS: un UPDATE y un SELECT. Estimado: 1 evento/seg por rider activo = 120 queries/min/rider. Con 10 riders simultáneos: 1.200 queries/min solo en ubicación.

### F. Redundancia de middleware en admin.js (menor)
Las rutas `PUT /usuarios/:id` (línea 326) y `DELETE /usuarios/:id` (línea 349) tienen `auth, solo('admin')` como parámetros inline además del `router.use(auth, solo('admin'))` global en línea 14. No es un bug de seguridad — el middleware global ya cubre todas las rutas — pero es código redundante.

---

## Ineficiencias concretas

| Archivo:Línea | Problema | Impacto estimado |
|---|---|---|
| `sockets/index.js:67` | 2 queries DB por evento GPS sin throttle | 1.200+ queries/min con 10 riders activos |
| `sockets/index.js:101` | `pedido:seguir` sin verificación propiedad | Espionaje GPS de cualquier entrega activa |
| `sockets/index.js:161` | `chat:enviar` sin verificación propiedad | Inyección de mensajes en chats ajenos |
| `sockets/index.js:162` | `texto` sin límite de longitud | DoS de memoria vía WebSocket (nuevo) |
| `admin.js:201` | `LIMIT 100` hardcodeado en liquidaciones | Vista incompleta más allá de 100 liquidaciones |
| `admin.js:294` | INSERT con columnas inexistentes, silenciado | Audit trail de bonos riders = 0 registros |
| `admin.js:326,349` | `auth, solo('admin')` duplicado (inline + router.use) | Código redundante (no es bug de seguridad) |
| `pedidos.js:317` | `neg.id` sin null-guard previo | Crash 500 si negocio no existe en DB |
| `auth.js:24-65` | Map de IPs sin purge en fallback memoria | Memory leak bajo restarts |
| `migrate.js` línea 204 | Sin índice `flow_token`, `created_at`, `entregado_at`, `hora_retiro` | Seq scans en reportes y scheduler (60s interval) |

---

## Oportunidades de mejora basadas en datos

1. **Implementar los 9 fixes pendientes directamente al código** — El bloqueo es de ejecución, no de calidad. Todos los fixes están correctamente escritos en `mejoras.md`. Solo falta editar los archivos `.js` y hacer commit.

2. **Crear tabla `bonos_riders`** — Schema mínimo: `(id, rider_id, monto, motivo, admin_id, created_at)`. Reemplaza el INSERT fallido en `admin.js:294` y agrega trazabilidad real. Alternativa mínima: loguear el error en lugar de silenciarlo.

3. **Throttle `rider:ubicacion`** — Acumular en `Map<rider_id, {lat,lng}>`, flush a DB cada 5s, broadcast WebSocket inmediato siempre. Reducción ~80% queries GPS.

4. **Índice `idx_pedidos_hora_retiro` es el más urgente** — El scheduler de agendados corre query en `hora_retiro` cada ~60s haciendo full scan de la tabla pedidos.

5. **Limitar longitud de mensajes de chat** — Un trim y límite de 500 caracteres en `chat:enviar` evita el DoS de memoria documentado en `mejoras.md` sección 1.

6. **Decisión sobre `RESIDUAL_PCT`** — Implementar en las liquidaciones si el modelo lo requiere, o eliminar de config. 10 semanas de deuda técnica sin resolución.

---

## Mensajes para otros agentes

- **PARA MEJORAS:** CRÍTICO (10ª semana consecutiva) — commit `ecdccd6` del 03/08 solo tocó `mejoras.md`, ningún `.js` fue modificado. Aplica en este orden: (1) `sockets/index.js:101` auth `pedido:seguir` — cualquier usuario autenticado espía GPS de pedidos ajenos; (2) `sockets/index.js:161` auth `chat:enviar` — cualquier usuario inyecta mensajes en chats ajenos; (3) `sockets/index.js:162` trim + límite 500 chars en `chat:enviar` — DoS de memoria por WebSocket (nuevo desde tu reporte del 03/08); (4) `admin.js:294` el INSERT a `pagos` usa columnas `rider_id, tipo, metadata` inexistentes — audit trail de bonos riders nunca se graba; solución correcta: crear tabla `bonos_riders (id, rider_id, monto, motivo, created_at)` y agregar a migrate.js; (5) `pedidos.js:317` agregar `if (!neg) return res.status(403).json({ error: 'Negocio no encontrado' })` antes de `params.push(neg.id)`; (6) `sockets/index.js:67` throttle ubicación (flush DB cada 5s, broadcast WebSocket inmediato); (7) `admin.js:201` paginación `LIMIT $1 OFFSET $2` con params `page`/`limit`; (8) `auth.js:24` setInterval purge Map IPs expiradas; (9) `migrate.js` tras línea 204: `CREATE INDEX IF NOT EXISTS idx_pagos_flow_token ON pagos(flow_token)`, `idx_pedidos_created_at ON pedidos(created_at)`, `idx_pedidos_entregado_at ON pedidos(entregado_at)`, `idx_pedidos_hora_retiro ON pedidos(hora_retiro)`. El código correcto para todos ya está en `reportes/mejoras.md` — solo falta copiarlo a los archivos `.js` y hacer commit incluyendo esos archivos `.js`.

- **PARA GERENTE:** El Agente Mejoras lleva 10 semanas documentando fixes correctos sin aplicarlos al código fuente — es el problema técnico acumulado de mayor impacto del sistema (9 vulnerabilidades + bugs activos en producción). Con Rappi Turbo ya en Quilpué (8 km de Villa Alemana) la plataforma necesita estabilidad urgente. `RESIDUAL_PCT: 8` sigue sin ninguna implementación en el backend — requiere decisión de Matías antes de producción real (implementar en liquidaciones o eliminar de config). `mostrar_costo_seguimiento` sigue confirmado como implementado — tarea cerrada.
