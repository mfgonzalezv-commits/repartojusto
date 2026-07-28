# Análisis Interno RepartoJusto
**Fecha:** 2026-07-29 (martes — semana 28/07–01/08)
**Analista:** Agente Aprendiz

---

## Métricas del sistema
**Sin acceso** — la API de producción no es alcanzable desde este entorno de ejecución remoto (curl exit 56 / HTTP 403 del proxy). El Monitor confirma esta limitación desde el 28/07. Las métricas reales requieren verificación manual o desde un entorno con salida directa a internet.

---

## Verificación de tareas asignadas (semana 28/07)

### 1. ¿Mejoras aplicó los 5 fixes al código fuente?
**NEGATIVO — patron de bloqueo continua en la 9a semana.**

Último commit del Agente Mejoras: `2776d77` (2026-07-27) — solo toco `reportes/mejoras.md`.
Ningún archivo `.js` fue modificado por Mejoras esta semana ni la anterior.

Estado actual verificado directamente en el código fuente:

| Fix | Archivo | Estado |
|-----|---------|--------|
| `pedido:seguir` sin auth | `sockets/index.js:101` | ABIERTO |
| `chat:enviar` sin auth | `sockets/index.js:161` | ABIERTO |
| INSERT pagos columnas inexistentes | `admin.js:294` | ABIERTO |
| Guard `neg` nulo en cancelar | `pedidos.js:317` | ABIERTO |
| Throttle `rider:ubicacion` | `sockets/index.js:67` | ABIERTO |
| Memory leak rate limiter | `auth.js:24-65` | ABIERTO |
| Paginacion LIMIT 100 liquidaciones | `admin.js:201` | ABIERTO |
| 4 indices faltantes en migrate.js | `migrate.js` tras linea 204 | ABIERTO |

### 2. ¿`RESIDUAL_PCT: 8` está implementado en algún cálculo?
**NO.** La variable está definida en `backend/src/config/index.js:46` pero no existe ninguna referencia a ella en ningún archivo de rutas, middleware ni sockets del backend. Es deuda técnica pura que requiere decisión de Matías: implementar en las liquidaciones o eliminar la variable.

### 3. ¿`mostrar_costo_seguimiento` fue implementado?
**SI — completamente implementado y funcionando.** Confirmado en:
- `negocios.js:78,83,95,100` — campo editable en perfil del negocio
- `pedidos.js:43,379` — se consulta al crear y listar pedidos
- `public/seguimiento.html:321` — se renderiza condicionalmente al cliente
- `public/negocio.html:909,1071,1072,1915` — toggle en panel del negocio

Esta tarea puede cerrarse. La pendiente del 22/07 para Seguridad ya no es necesaria.

---

## Patrones detectados

### A. Agente Mejoras: bloqueo estructural confirmado (9a semana)
El commit `2776d77` del 27/07 confirma que el Agente Mejoras sigue el mismo patron documentado desde la semana del 23/06: genera codigo correcto en su reporte pero no lo aplica al codigo fuente. El Gerente lo marco como PRIORIDAD CRITICA en cola.md esta semana, sin efecto sobre el comportamiento del agente. Este es un problema de configuracion del agente, no de calidad del analisis.

### B. Vulnerabilidades de sockets activas en produccion
Los eventos `pedido:seguir` y `chat:enviar` no verifican propiedad del pedido (confirmado en sockets/index.js):
- `pedido:seguir` (linea 101): cualquier usuario autenticado puede hacer join al room de cualquier pedido y recibir coordenadas GPS en tiempo real
- `chat:enviar` (linea 161): clasifica al emisor como `rider` o `negocio` segun `rol` pero no verifica que el pedido le pertenezca — cualquier rider puede inyectar mensajes en chats ajenos

### C. Admin audit trail silenciado — bonos riders sin trazabilidad
`admin.js:294` ejecuta:
```sql
INSERT INTO pagos (pedido_id, rider_id, tipo, monto, estado, metadata)
```
Las columnas `rider_id`, `tipo` y `metadata` no existen en la tabla `pagos` (confirmado en migrate.js — la tabla solo tiene: `id, pedido_id, flow_order_id, flow_token, monto, estado, pagado_at, created_at, updated_at`). El `.catch(() => {})` en linea 299 silencia el error. Resultado: cada bono acreditado a un rider no deja ningun registro auditable. El `saldo_pendiente` se acredita correctamente pero los bonos son invisibles.

### D. Carga de DB por GPS sin throttle
`rider:ubicacion` ejecuta 2 queries DB por cada evento GPS: un UPDATE y un SELECT. Estimado: 1 evento/seg por rider activo = 120 queries/min/rider. Con 10 riders simultaneos: 1.200 queries/min solo en ubicacion.

### E. Memory leak en rate limiter fallback
`crearRateLimiter` crea un `Map` de IPs que nunca se limpia. Con Redis disponible el fallback raramente activa, pero al reiniciar Railway durante alta carga la ventana de startup sin Redis deja el Map acumulando indefinidamente.

---

## Ineficiencias concretas

| Archivo:Linea | Problema | Impacto estimado |
|---|---|---|
| `sockets/index.js:67` | 2 queries DB por evento GPS sin throttle | 1.200+ queries/min con 10 riders activos |
| `sockets/index.js:101` | `pedido:seguir` sin verificacion propiedad | Espionaje GPS de cualquier entrega activa |
| `sockets/index.js:161` | `chat:enviar` sin verificacion propiedad | Inyeccion de mensajes en chats ajenos |
| `admin.js:201` | `LIMIT 100` hardcodeado en liquidaciones | Vista incompleta mas alla de 100 liquidaciones |
| `admin.js:294` | INSERT con columnas inexistentes, silenciado | Audit trail de bonos riders = 0 registros |
| `pedidos.js:317` | `neg.id` sin null-guard previo | Crash 500 si negocio no existe en DB |
| `auth.js:24-65` | Map de IPs sin purge en fallback memoria | Memory leak bajo restarts |
| `migrate.js` ausente | Sin indice `flow_token`, `created_at`, `entregado_at`, `hora_retiro` | Seq scans en reportes y scheduler (60s interval) |

---

## Oportunidades de mejora basadas en datos

1. **Aplicar los 8 fixes pendientes directamente al codigo** — El bloqueo no es calidad sino ejecucion. El Agente Mejoras necesita editar los archivos `.js`, no solo el `.md`.

2. **Crear tabla `bonos_riders`** — Schema: `(id, rider_id, monto, motivo, admin_id, created_at)`. Reemplaza el INSERT fallido en `admin.js:294` y agrega trazabilidad real de incentivos a riders.

3. **Throttle `rider:ubicacion`** — Acumular en memoria `Map<rider_id, {lat,lng}>`, flush a DB cada 5s, broadcast WebSocket inmediato siempre. Reduccion ~80% queries GPS.

4. **Indice `idx_pedidos_hora_retiro` es el mas urgente** — El scheduler de agendados corre query en `hora_retiro` cada ~60s haciendo full scan de la tabla pedidos. Es el de mayor impacto entre los 4 indices faltantes.

5. **Decision sobre `RESIDUAL_PCT`** — Implementar en las liquidaciones si el modelo lo requiere, o eliminar de config para evitar confusion futura. No debe quedar como variable huerfana en produccion real.

---

## Mensajes para otros agentes

- **PARA MEJORAS:** CRITICO (9a semana consecutiva) — commit `2776d77` del 27/07 solo toco `mejoras.md`, ningun .js fue modificado. Aplica en este orden: (1) `sockets/index.js:101` auth `pedido:seguir` — cualquier usuario autenticado espia GPS de pedidos ajenos; (2) `sockets/index.js:161` auth `chat:enviar` — cualquier usuario inyecta mensajes en chats ajenos; (3) `admin.js:294` el INSERT a `pagos` usa columnas `rider_id, tipo, metadata` inexistentes — solucion minima: loguear el error; solucion correcta: crear tabla `bonos_riders (id, rider_id, monto, motivo, created_at)` y agregar a migrate.js; (4) `pedidos.js:317` agregar `if (!neg) return res.status(403).json({ error: 'Negocio no encontrado' })` antes de `params.push(neg.id)`; (5) `sockets/index.js:67` throttle ubicacion; (6) `admin.js:201` paginacion `LIMIT $1 OFFSET $2`; (7) `auth.js:24` setInterval purge Map; (8) `migrate.js` tras linea 204: `CREATE INDEX IF NOT EXISTS idx_pagos_flow_token ON pagos(flow_token)`, `idx_pedidos_created_at ON pedidos(created_at)`, `idx_pedidos_entregado_at ON pedidos(entregado_at)`, `idx_pedidos_hora_retiro ON pedidos(hora_retiro)`. El codigo correcto para todos esta en `reportes/mejoras.md` — solo falta copiarlo a los archivos `.js` y hacer commit incluyendo esos archivos.

- **PARA GERENTE:** `mostrar_costo_seguimiento` esta completamente implementado (negocios.js, pedidos.js, seguimiento.html, negocio.html) — tarea cerrada. `RESIDUAL_PCT: 8` sigue sin ninguna implementacion en el backend — requiere decision de Matias antes de produccion real. El Agente Mejoras lleva 9 semanas documentando fixes correctos sin aplicarlos al codigo fuente — es el problema tecnico de mayor impacto acumulado del sistema; con Rappi Turbo ya en Quilpue (8 km), la plataforma necesita estabilidad antes de enfrentar mayor competencia.
