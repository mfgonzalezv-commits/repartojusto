# Análisis Interno RepartoJusto
**Fecha:** 2026-07-07
**Agente:** Aprendiz (análisis semanal)

---

## Métricas del sistema

**Sin acceso.** La API de producción (`repartojusto-production.up.railway.app`) no es alcanzable desde el entorno de ejecución del agente (proxy bloquea con HTTP 403). No se pudieron obtener métricas reales de pedidos, riders o negocios.

---

## Verificaciones de la semana anterior (tareas asignadas)

### 1. Bug push-subscription (`riders.js:183`) — CONFIRMADO CORREGIDO ✓

El archivo actual tiene `req.usuario.id` en línea 183. No hay ninguna referencia a `req.user.id` en todo `riders.js`. El fix está en el código desde al menos el commit `a7b23a7` (2026-07-05).

### 2. Paginación en `GET /api/admin/liquidaciones` — SIGUE SIN APLICAR ✗

`backend/src/routes/admin.js:197` mantiene `LIMIT 100` hardcodeado, sin `page`/`limit` como query params. El Agente Mejoras documentó el fix en su reporte del 07/06, pero el commit `c259dd4` (mejoras: reporte semanal 2026-07-06) solo modificó `reportes/mejoras.md` sin tocar `admin.js`.

### 3. `RESIDUAL_PCT: 8` en config — DEUDA TÉCNICA CONFIRMADA ✗

`backend/src/config/index.js:46` define `RESIDUAL_PCT: parseFloat(process.env.RESIDUAL_PCT) || 8`. Búsqueda exhaustiva en todo `backend/src/` no encontró ninguna referencia a esta variable fuera de su definición. No se calcula en ningún precio, liquidación ni tarifa. Requiere decisión de Matías: implementar o eliminar.

---

## Patrón crítico detectado esta semana

**El Agente Mejoras documenta fixes pero no los aplica al código** (patrón activo hace al menos 4 semanas).

Evidencia directa: commit `c259dd4` del 2026-07-06 incluye 5 correcciones bien especificadas en `mejoras.md`, pero el diff del commit solo toca ese archivo. Ninguna de las 5 mejoras existe en el código fuente hoy. El mismo patrón ocurrió con el commit `0978eaa` del 29/06 reportado por el Aprendiz anterior.

El resultado es una deuda de correcciones que crece cada semana pero nunca llega a producción.

---

## Ineficiencias concretas (por estado actual del código)

| # | Archivo:Línea | Problema | Impacto estimado |
|---|---|---|---|
| 1 | `backend/src/routes/admin.js:197` | `LIMIT 100` hardcodeado en liquidaciones, sin paginación | Con volumen real de liquidaciones el endpoint deja de ser útil; datos truncados silenciosamente |
| 2 | `backend/src/routes/auth.js:10-31` | Rate limiter Map nunca purga entradas expiradas — memory leak gradual | En producción con tráfico real el heap Node crece indefinidamente hasta crash |
| 3 | `backend/src/sockets/index.js:67` | Cada ping GPS del rider escribe a PostgreSQL sin throttle | A 1 ping/3s por rider activo: 20 riders = 400 escrituras/min consumiendo pool de DB innecesariamente |
| 4 | `backend/src/sockets/index.js:101` | `pedido:seguir` no verifica que el socket pertenezca al pedido | Cualquier usuario autenticado puede suscribirse al tracking GPS de cualquier pedido ajeno |
| 5 | `backend/src/sockets/index.js:14` | `chatHistory` vive en memoria (Map) | Todo historial de chat se pierde en cada restart/deploy |
| 6 | `backend/scripts/migrate.js` | Faltan 4 índices nunca agregados ni ejecutados en producción | Queries frecuentes sin índice: `idx_pagos_flow_token` (lookup webhook), `idx_pedidos_created_at` (metricas), `idx_pedidos_entregado_at` (liquidaciones), `idx_pedidos_hora_retiro` (scheduler corre cada 60s sin este índice) |
| 7 | `backend/src/config/index.js:46` | `RESIDUAL_PCT: 8` definido, nunca referenciado en cálculos | Variable huérfana en config — no genera error pero representa ingresos no cobrados o modelo sin implementar |

---

## Oportunidades de mejora basadas en datos

1. **Throttle GPS + índice hora_retiro son las ganancias de rendimiento más inmediatas** — El scheduler de pedidos agendados corre cada 60 segundos con una query sobre `pedidos.hora_retiro` sin índice. Combinado con el throttle de rider:ubicacion (80% menos escrituras a DB), estas dos correcciones aliviarían la carga de la DB más que cualquier otra optimización pendiente.

2. **El único canal de mejora funcional es que los cambios se apliquen directamente al código** — El Agente Mejoras lleva múltiples semanas generando código correcto y detallado en su reporte pero sin commit al código fuente. La bottleneck no es la identificación del problema sino la ejecución.

3. **La deuda de 4 índices es costo cero de aplicar** — Son `CREATE INDEX IF NOT EXISTS`, operaciones idempotentes sin riesgo. Ejecutarlas contra producción (Railway console o migrate.js) no requiere downtime y elimina full-scans en las queries más frecuentes del sistema.

4. **`RESIDUAL_PCT` requiere decisión antes de activar modo producción** — Si Matías planea cobrar el 8% residual, debe implementarse en el cálculo de liquidaciones. Si no, debe eliminarse de config para evitar confusión futura.

---

## Mensajes para otros agentes

- **PARA MEJORAS:** Los 5 fixes documentados en tu reporte del 07/06 (memory leak auth.js, pedido:seguir sin auth, rider:ubicacion sin throttle, chatHistory volátil, race condition cascada) NO están en el código. El commit `c259dd4` solo tocó `mejoras.md`. Los mismos 5 problemas siguen activos en producción. Prioridad de aplicación: (1) `auth.js:10-31` memory leak rate limiter — agregar setInterval de purge, (2) `admin.js:197` reemplazar `LIMIT 100` por paginación `page`/`limit`, (3) agregar a `migrate.js` y ejecutar los 4 índices: `idx_pagos_flow_token`, `idx_pedidos_created_at`, `idx_pedidos_entregado_at`, `idx_pedidos_hora_retiro`. El throttle de `rider:ubicacion` (sockets/index.js:67) es el mayor impacto de rendimiento.

- **PARA GERENTE:** Dos situaciones requieren decisión de Matías: (1) El Agente Mejoras lleva 4+ semanas generando borradores de código correctos pero sin aplicarlos al código fuente — hay 5 fixes listos para copiar/pegar en el código hoy; (2) `RESIDUAL_PCT: 8` en `config/index.js:46` es una variable huérfana que representa ingresos no cobrados o un modelo de negocio sin implementar — necesita resolución antes del lanzamiento en modo producción.
