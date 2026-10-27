# Análisis Interno RepartoJusto
**Fecha:** 2026-10-27 (Agente Aprendiz — ejecución semanal)

---

## Métricas del sistema
**Sin acceso** — el proxy de este entorno rechazó la conexión a `repartojusto-production.up.railway.app:443`. No fue posible obtener datos reales de la API (pedidos, riders activos, ingresos). El monitor sí tiene acceso; ver `reportes/monitor.md` para estado del servidor.

---

## Cambios esta semana (git log últimos 7 días, excluyendo monitor)
- `2026-10-27` — ventas: actualización pipeline
- `2026-10-26` — ventas: actualización pipeline
- `2026-10-26` — mejoras: reporte semanal

**Patrón crítico confirmado:** El commit de Mejoras del 26/10 sigue siendo solo en `reportes/mejoras.md`. Cero cambios en archivos `.js`. El patrón de documentar sin aplicar lleva activo desde julio.

---

## Estado de bugs documentados previamente

### ✅ CORREGIDOS (verificado en código fuente)
1. **`req.user.id` → `req.usuario.id` en riders.js**: CORREGIDO. Todo `riders.js` usa `req.usuario.id` consistentemente (líneas 28, 55, 69, 96, 112, 224). Push notifications a riders deberían funcionar.
2. **HMAC webhook Flow**: IMPLEMENTADO. `pagos.js:144-165` tiene validación HMAC completa con `timingSafeEqual`. Rechaza sin `FLOW_SECRET` configurado o sin `x-flow-signature`.
3. **`mostrar_costo_seguimiento`**: IMPLEMENTADO. `server.js:140,153-154` lee la columna del negocio y oculta `tarifa_entrega` si el negocio no la activa.

### ❌ PENDIENTES (sin cambio en código)
1. **`pedido:seguir` sin verificación de acceso** (`sockets/index.js:101`): Cualquier socket puede hacer `socket.join('pedido:<uuid>')` con cualquier `pedido_id`. No hay verificación de que el cliente, rider o negocio tenga relación con ese pedido. Riesgo: tracking de pedidos ajenos.
2. **Bono audit trail silenciado** (`admin.js:321`): `INSERT INTO pagos (pedido_id, rider_id, tipo, monto, estado, metadata)` usa columnas `rider_id`, `tipo`, `metadata` que NO existen en la tabla `pagos` (schema en migrate.js). El `.catch(() => {})` silencia el error. Cada bono manual falla en registrar el audit trail sin que nadie lo sepa.
3. **`GET /api/admin/liquidaciones` LIMIT 100 hardcodeado** (`admin.js:231`): Sin paginación. Con muchas liquidaciones, la respuesta crece ilimitada.
4. **Índices faltantes en migrate.js**: Los siguientes índices fueron pedidos desde mayo y siguen sin estar en el script:
   - `CREATE INDEX IF NOT EXISTS idx_pagos_flow_token ON pagos(flow_token)` — usado en cada confirmación de pago
   - `CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON pedidos(created_at)` — usado en métricas de ingresos
   - `CREATE INDEX IF NOT EXISTS idx_pedidos_entregado_at ON pedidos(entregado_at)` — usado en reportes de entregas
   - `CREATE INDEX IF NOT EXISTS idx_pedidos_hora_retiro ON pedidos(hora_retiro)` — usado por el scheduler de pedidos agendados (setInterval en asignacion.js)

---

## Patrones detectados en el código

### Query sin índice en endpoint de métricas
`admin.js` — `GET /api/admin/metricas/ingresos` hace `GROUP BY DATE(created_at)` filtrando `created_at > NOW() - INTERVAL '30 days'`. Sin `idx_pedidos_created_at`, esto es full table scan en `pedidos` cada vez que el dashboard carga. Impacto crece con volumen.

### chat:enviar usa rol del socket padre sin verificar pedido
`sockets/index.js:161`: El handler `chat:enviar` usa `rol` y `nombre` del socket autenticado para marcar mensajes, lo que está bien. Pero NO verifica que el socket tenga relación con `pedido_id` antes de emitir. Un rider o negocio puede inyectar mensajes en chats de pedidos que no le pertenecen.

### RESIDUAL_PCT deuda técnica confirmada
`config/index.js:52` define `RESIDUAL_PCT: 8`. Búsqueda exhaustiva en todos los archivos `.js` del backend: **cero referencias** a esta variable fuera de su definición. El 8% residual no se aplica en ningún cálculo de tarifas, pagos ni liquidaciones. Requiere decisión de Matías: implementar o eliminar.

### Scheduler de pedidos agendados: ya implementado vía setInterval
Confirmado en análisis anterior — `asignacion.js` usa `setInterval`. No requiere `node-cron`. Sí requiere `idx_pedidos_hora_retiro` para eficiencia.

---

## Ineficiencias concretas

| Archivo | Línea | Problema | Impacto estimado |
|---|---|---|---|
| `admin.js` | 321 | INSERT audit trail bono usa columnas inexistentes, silenciado | Cada bono manual sin registro (dato perdido para siempre) |
| `admin.js` | 231 | LIMIT 100 hardcodeado en liquidaciones | Falla cuando hay >100 liquidaciones |
| `sockets/index.js` | 101 | `pedido:seguir` sin auth check | Cualquiera puede trackear cualquier pedido |
| `sockets/index.js` | 161 | `chat:enviar` sin verificar propiedad del pedido | Mensajes falsos en chats ajenos |
| `scripts/migrate.js` | — | 4 índices críticos faltantes | Full table scans en confirmar pagos y métricas |
| `config/index.js` | 52 | `RESIDUAL_PCT: 8` nunca usado | Tarifa fantasma en config |

---

## Oportunidades de mejora basadas en datos

1. **Agregar 4 índices faltantes** — Evidencia: definidos en cola.md desde mayo/2026, el scheduler y el endpoint de métricas los usan pero no existen. Son 4 líneas en `migrate.js` + una ejecución contra producción. Impacto inmediato en performance.

2. **Fix audit trail de bonos riders** — Evidencia: columnas `rider_id`, `tipo`, `metadata` no existen en tabla `pagos`. El INSERT falla silenciosamente cada vez. Solución: o eliminar el `.catch(() => {})` para que el error sea visible, o crear una tabla `logs_incentivos` separada. Un negocio que crece necesita trazabilidad de pagos.

3. **Paginación en GET /api/admin/liquidaciones** — Evidencia: hardcodeado `LIMIT 100`. Si hay más de 100 liquidaciones el admin no las ve. Agregar `page`/`limit` en query params.

4. **Verificación de acceso en `pedido:seguir`** — Evidencia: handler en sockets/index.js:101 sin auth. El código del fix fue documentado en mejoras.md hace meses. Una query simple verifica si `pedido_id` pertenece al negocio/rider del socket.

---

## Mensajes para otros agentes

- **PARA MEJORAS:** Los 4 bugs pendientes desde julio siguen sin corrección en código fuente (confirmado por git log — commit del 26/10 solo tocó `reportes/mejoras.md`). PRIORIDAD 1: `sockets/index.js:101` — agregar verificación de acceso en `pedido:seguir`. PRIORIDAD 2: `admin.js:321` — eliminar `.catch(() => {})` en INSERT del bono para hacer visible el error (o crear tabla logs). PRIORIDAD 3: agregar en `migrate.js` los 4 índices: `idx_pagos_flow_token`, `idx_pedidos_created_at`, `idx_pedidos_entregado_at`, `idx_pedidos_hora_retiro`. Son cambios de 1-5 líneas cada uno. Verificar con `git diff` que los archivos `.js` cambian.
- **PARA GERENTE:** req.user/riders.js CORREGIDO y HMAC webhook CORREGIDO — dos riesgos históricos ya cerrados. Quedan 4 issues técnicos activos: tracking sin auth (ALTO), audit trail de bonos silenciado (MEDIO), liquidaciones sin paginación (BAJO), e índices DB faltantes (BAJO-MEDIO). `RESIDUAL_PCT: 8` sigue sin implementarse en ningún cálculo — requiere decisión de Matías (activar lógica de residual o eliminar la variable).
