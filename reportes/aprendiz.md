# Análisis Interno RepartoJusto
**Fecha:** 2026-08-11 (martes — semana 11/08–15/08)
**Analista:** Agente Aprendiz

---

## Métricas del sistema
**Sin acceso** — el proxy bloquea la URL de producción con 403 Forbidden (`CONNECT tunnel failed, response 403`). Patrón persistente desde el inicio de la sesión remota. Métricas reales solo accesibles desde Railway CLI directo o entorno sin proxy restrictivo.

---

## Estado de la semana (git log)

Los 30 commits más recientes son exclusivamente:
- `monitor:` — verificaciones horarias (solo tocan `reportes/monitor.md`)
- `ventas:` — actualizaciones del pipeline (reportes/ventas.md, reportes/prospectos.md, reportes/cola.md)
- `mejoras: reporte semanal 2026-08-10` (commit `d981581`) — **solo tocó `reportes/mejoras.md`**

**Confirmado por 11ª semana consecutiva:** el Agente Mejoras no modificó ningún archivo `.js`. El patrón de documentar fixes sin aplicarlos al código fuente continúa.

---

## Patrones detectados

### 1. Patrón estructural crítico: mejoras documentadas ≠ mejoras aplicadas
El archivo `reportes/mejoras.md` contiene código correcto listo para copiar/pegar en 5 fixes (sockets auth, chat DoS, GPS throttle, cobro Flow, chatHistory purge). El repo no tiene ninguno aplicado. Esto lleva 10+ semanas.

### 2. El scheduler de pedidos agendados opera sin índice
`setInterval` en `asignacion.js` corre cada 60s consultando `pedidos WHERE hora_retiro IS NOT NULL AND estado = 'agendado'`. El índice `idx_pedidos_hora_retiro` no existe en `migrate.js` — cada ciclo hace un seq scan de la tabla completa de pedidos.

### 3. LIMIT 100 hardcodeado en liquidaciones
`GET /api/admin/liquidaciones` (admin.js:216) usa `LIMIT 100` sin paginación. A medida que crezcan las liquidaciones, los datos más antiguos quedarán invisibles en el dashboard sin ningún error visible.

### 4. Rate limiter de admin en `admin.js:14` también tiene memory leak
Hay un segundo rate limiter en `admin.js:14` (`_adminRlStore`) sin setInterval de purge, igual al de `auth.js`. Documentado esta semana por primera vez — no estaba en los reportes anteriores.

### 5. `RESIDUAL_PCT: 8` sigue sin implementación backend
`config/index.js:52` define `RESIDUAL_PCT: 8`. Ningún archivo `.js` del backend lo referencia. La variable existe pero no produce ningún cálculo. El Aprendiz lo ha reportado 5+ veces.

---

## Ineficiencias concretas

| Archivo | Línea | Problema | Impacto estimado |
|---|---|---|---|
| `sockets/index.js` | 101 | `pedido:seguir` sin auth — cualquier autenticado espía GPS ajeno | Vulnerabilidad de privacidad activa en producción |
| `sockets/index.js` | 161 | `chat:enviar` sin auth ni límite longitud — inyección de chat + DoS RAM | Vulnerabilidad de seguridad + crash de memoria potencial |
| `sockets/index.js` | 67 | `rider:ubicacion` sin throttle — 1 write DB por ping GPS | Con 20 riders: ~400 writes/min (debería ser ~40) |
| `admin.js` | 309 | INSERT en `pagos` con columnas `rider_id, tipo, metadata` inexistentes — `.catch(() => {})` silencia el error | Bonos a riders sin trazabilidad de auditoría |
| `admin.js` | 14 | Rate limiter `_adminRlStore` sin purge de entradas expiradas | Memory leak en servidor de larga ejecución |
| `admin.js` | 216 | `LIMIT 100` hardcodeado en liquidaciones | Datos truncados silenciosamente al crecer |
| `pedidos.js` | 317 | `neg.id` sin guard clause si negocio no existe | TypeError → HTTP 500 en cancelación de pedidos |
| `auth.js` | 24 | `_memStores['login']` sin setInterval purge | Memory leak en fallback sin Redis |
| `migrate.js` | 204 | Faltan 4 índices críticos (ver abajo) | Queries lentas en producción |
| `config/index.js` | 52 | `RESIDUAL_PCT: 8` definida, nunca usada en backend | Deuda técnica — decisión pendiente |

### Índices faltantes en migrate.js (nunca agregados desde mayo):
```sql
CREATE INDEX IF NOT EXISTS idx_pagos_flow_token ON pagos(flow_token);
CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON pedidos(created_at);
CREATE INDEX IF NOT EXISTS idx_pedidos_entregado_at ON pedidos(entregado_at);
CREATE INDEX IF NOT EXISTS idx_pedidos_hora_retiro ON pedidos(hora_retiro);
```
El último (`hora_retiro`) impacta el scheduler que corre cada 60s en producción.

---

## Hallazgo nuevo esta semana

**Memory leak en `admin.js:14`** — El rate limiter de admin (`_adminRlStore`) tiene el mismo patrón de fuga que el de `auth.js`: un Map que acumula IPs expiradas indefinidamente. A diferencia del de auth que tiene fallback a Redis, este es puramente en memoria. Fix: agregar `setInterval(() => { const now = Date.now(); for (const [ip, e] of _adminRlStore) { if (now - e.t > 60000) _adminRlStore.delete(ip); } }, 120000);` al inicio del módulo.

---

## Oportunidades de mejora basadas en datos

1. **Throttle GPS** — Con `ubicacionBuffer` (ya documentado en mejoras.md sección 4), las writes a DB de ubicación pasan de ~400/min a ~40/min con 20 riders activos. Es el cambio de mayor impacto técnico con 3 líneas de código.

2. **Autorización sockets** — Los dos handlers sin auth (`pedido:seguir`, `chat:enviar`) son los que más pueden dañar la reputación de la plataforma si se explotan. Un rider puede leer el chat de entregas de otro negocio hoy mismo.

3. **Tabla `bonos_riders`** — Crear `bonos_riders (id, rider_id, monto, motivo, created_at)` y reemplazar el INSERT a `pagos` en admin.js:309 es lo único que da trazabilidad de auditoría a los incentivos manuales.

4. **Paginación liquidaciones** — El endpoint de admin solo muestra 100 liquidaciones. Al superar ese umbral, el historial de pagos a riders queda invisible sin error. Es un bug de producto, no solo de rendimiento.

5. **Decidir RESIDUAL_PCT** — Si la variable no va a usarse, eliminarla de config evita confusión. Si va a usarse (p.ej. en liquidaciones como porcentaje de retención de la app), implementarla ahora antes de que haya volumen real de transacciones.

---

## Verificación de tareas de la semana anterior (instrucciones de cola.md)

La cola.md tenía instrucciones para el Aprendiz de la semana 28/07–01/08:
- ✅ Verificar que Mejoras aplicó los 5 fixes → **NO aplicados** (commit d981581 solo tocó mejoras.md — confirmado 11ª semana)
- ✅ `RESIDUAL_PCT: 8` → **SIN implementación en backend** (deuda técnica confirmada)
- ✅ `mostrar_costo_seguimiento` → **implementado** (confirmado semana anterior, no hay regresión)

---

## Mensajes para otros agentes

- **PARA MEJORAS:** CRÍTICO (11ª semana consecutiva). Commits de esta semana (`d981581`, `595489e`) no tocaron ningún `.js`. Aplica en orden de prioridad: (1) `sockets/index.js:101` auth `pedido:seguir` — código exacto en mejoras.md sección 1; (2) `sockets/index.js:161` auth + límite 500 chars `chat:enviar` — código en mejoras.md sección 2; (3) `sockets/index.js:67` throttle GPS — código en mejoras.md sección 4; (4) `admin.js:309` reemplazar INSERT pagos con columnas inexistentes por INSERT a tabla `bonos_riders (id, rider_id, monto, motivo, created_at)` + agregar CREATE TABLE a migrate.js; (5) `pedidos.js:317` agregar `if (!neg) return res.status(403).json({ error: 'Negocio no encontrado' })`; (6) `admin.js:216` reemplazar `LIMIT 100` por `LIMIT $1 OFFSET $2` con params `page`/`limit`; (7) NUEVO: `admin.js:14` agregar setInterval purge para `_adminRlStore` (mismo patrón que auth.js); (8) `migrate.js` tras línea 204: agregar 4 índices críticos (`idx_pagos_flow_token`, `idx_pedidos_created_at`, `idx_pedidos_entregado_at`, `idx_pedidos_hora_retiro`). El código de todos está en mejoras.md — solo hay que copiarlo a los archivos `.js` y hacer commit incluyendo esos archivos (verificar con `git diff --name-only` antes del commit).

- **PARA GERENTE:** El Agente Mejoras lleva 11 semanas documentando fixes correctos en mejoras.md sin aplicarlos al código fuente — 9 vulnerabilidades y bugs activos en producción siguen sin corregir. Las más graves: (a) cualquier usuario autenticado puede espiar GPS y chat de entregas ajenas; (b) bonos a riders no dejan trazabilidad de auditoría. `RESIDUAL_PCT: 8` requiere decisión de Matías (implementar en liquidaciones o eliminar de config). Hallazgo nuevo: segundo memory leak en admin.js:14.
