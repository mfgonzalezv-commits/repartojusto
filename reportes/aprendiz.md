# Análisis Interno RepartoJusto
**Fecha:** 2026-05-12
**Agente:** Aprendiz
**Fuente:** Análisis estático de código (API bloqueada por allowlist en entorno de análisis)

---

## Métricas del sistema

**Sin acceso a API real** — la URL de producción responde HTTP 403 desde el entorno de análisis (Host not in allowlist). El agente Monitor confirma el mismo problema desde las 10:03 del 2026-05-12. Todas las métricas son estimaciones basadas en análisis de código.

**Estructura confirmada en código:**
- 10 tablas PostgreSQL activas: `usuarios`, `negocios`, `riders`, `pedidos`, `productos`, `clientes`, `pagos`, `liquidaciones`, `calificaciones` + tablas auxiliares
- 10 rutas REST implementadas: auth, pedidos, riders, negocios, pagos, admin, clientes, calificaciones, soporte, email
- Motor de asignación en cascada operativo con soporte Web Push
- Sistema de chat en tiempo real vía Socket.io
- 5 estrategias de cobro configurables por negocio

---

## Patrones detectados

### Lo que funciona bien
- El motor de asignación en cascada (`sockets/asignacion.js`) está bien diseñado: ofrece pedidos por proximidad con bonificación por calificación (20% de ventaja), timeout de 30s y fallback a broadcast público.
- Los triggers de `updated_at` están correctamente definidos en migrate.js.
- Los índices críticos de negocio están presentes: `idx_pedidos_negocio`, `idx_pedidos_rider`, `idx_pedidos_estado`, `idx_riders_disponible`.
- El middleware `errorHandler.js` captura correctamente errores de PostgreSQL (23505, 23503) y JWT.
- Las calificaciones de riders usan un sistema booleano multi-dimensión que alimenta el algoritmo de asignación — coherente con el modelo de negocio.

### Patrones problemáticos recurrentes
- **Doble query innecesaria**: 6 endpoints hacen primero un SELECT para obtener `negocio_id` o `rider_id`, luego la query principal. Patrón repetido en negocios.js (3 veces) y riders.js (2 veces).
- **Haversine triplicado**: Tres implementaciones distintas del cálculo de distancia en pedidos.js (`haversineKm`), riders.js (`haversineRiders`), y asignacion.js (aproximación plana). Además, asignacion.js usa una aproximación cartesiana en SQL (`(lat1-lat2)^2 + (lng1-lng2)^2 * cos(lat)`) que introduce error creciente a distancias mayores.
- **Feature completamente muda**: Tabla `productos` en migrate.js → sin rutas en `src/routes/` → los negocios no pueden gestionar menús por API.

---

## Ineficiencias concretas

| # | Archivo:línea | Problema | Impacto estimado |
|---|---|---|---|
| **1** | `backend/src/routes/riders.js:~110` | **BUG CRÍTICO**: `req.user.id` debería ser `req.usuario.id` en el endpoint `POST /api/riders/push-subscription`. Las suscripciones push NUNCA se guardan en DB. | Las notificaciones push a riders no llegan cuando la app está cerrada → riders pierden ofertas → pedidos quedan sin asignar |
| **2** | `backend/src/sockets/index.js:14` | Chat en memoria (`new Map()`). Historial destruido en cada redeploy de Railway. | Mala UX: riders y negocios pierden el contexto de la conversación en cada deploy |
| **3** | `backend/src/config/index.js:39` + código | `REDIS_URL` configurado pero Redis nunca importado en ningún archivo. Sin rate limiting, sin caching. | Queries de `/api/admin/metricas` (4 queries paralelas) corren sin caché en cada carga del dashboard |
| **4** | `backend/scripts/migrate.js` | Falta `CREATE INDEX ON pagos(flow_token)`. Todos los webhooks y confirmaciones de pago hacen sequential scan. | Cada pago requiere full table scan en pagos; escala mal con volumen |
| **5** | `backend/scripts/migrate.js` | Falta `CREATE INDEX ON pedidos(created_at)` y `ON pedidos(entregado_at)`. Ambas columnas usadas en WHERE de métricas y liquidaciones. | Queries de métricas y liquidaciones hacen seq scan en la tabla más grande |
| **6** | `backend/src/routes/admin.js:~130` | `POST /api/admin/riders/:id/incentivo` inserta en `pagos` con columnas `rider_id` y `tipo` que NO existen en el schema. El `.catch(() => {})` oculta el error silenciosamente. | El registro contable de incentivos nunca se crea; imposible auditar bonos |
| **7** | `backend/src/routes/pedidos.js:~200` + `backend/src/sockets` | Pedidos en estado `agendado` (con `hora_retiro`) no tienen scheduler que los active. El comment dice "el scheduler lo lanzará 10 min antes" pero ese scheduler no existe en el código. | Los negocios pueden crear pedidos agendados pero nunca se despachan automáticamente |
| **8** | `backend/src/config/index.js:43` | `RESIDUAL_PCT: 8` definido pero no utilizado en ningún cálculo de `calcularCargos()` ni en las queries de ingresos. | La lógica de negocio del 8% residual no está implementada |
| **9** | `backend/src/routes/negocios.js:138,165,200` | Tres endpoints hacen dos queries separadas para obtener `negocio_id` antes de la query principal. Mismo patrón en riders.js. | Latencia innecesaria: ~2-5ms por request adicional en cada operación de negocio |
| **10** | `backend/src/routes/admin.js:~200` | `GET /api/admin/liquidaciones` tiene `LIMIT 100` hardcodeado sin paginación. | Si se superan 100 liquidaciones, las más antiguas son invisibles para admin |

---

## Oportunidades de mejora basadas en datos

1. **Fix bug push-subscription → impacto inmediato en conversión de asignaciones**: Si las notificaciones push no llegan (BUG #1), los riders solo reciben ofertas cuando tienen la app activa. Corregir `req.user.id` → `req.usuario.id` en una línea de código restaura la funcionalidad completa de push, mejorando la tasa de asignación en el primer intento.

2. **Implementar scheduler de pedidos agendados → desbloquea feature de scheduling**: Los negocios pueden crear pedidos con `hora_retiro` pero nunca se despachan. Un job simple con `node-cron` que consulte `pedidos WHERE estado='agendado' AND hora_retiro BETWEEN NOW() AND NOW()+10min` y llame a `iniciarCascada` activaría esta feature sin cambios de schema.

3. **Agregar 3 índices críticos → mejora queries de métricas y pagos**: `pagos(flow_token)`, `pedidos(created_at)`, `pedidos(entregado_at)`. Son ALTER TABLE de minutos; impacto en performance de admin dashboard y procesamiento de webhooks Flow.

4. **Usar Redis para caching de métricas admin**: Los 4 queries de `/api/admin/metricas` podrían cachearse 60 segundos en Redis (ya configurado en infra, solo falta el código). Reduciría carga en PostgreSQL con cada refresh del dashboard.

5. **Crear `src/routes/productos.js` → habilitar gestión de menú**: La tabla existe, los índices existen, pero no hay endpoints. Es el único feature de schema completamente sin API. Los negocios necesitan gestionar su menú y actualmente es imposible.

6. **Centralizar cálculo de distancia**: Tres implementaciones distintas de haversine aumentan riesgo de inconsistencia en decisiones de asignación. Extraer a `src/utils/distancia.js` y usar la implementación trigonométrica correcta (no la aproximación cartesiana de asignacion.js).

---

## Mensajes para otros agentes

- **PARA MEJORAS**: Prioridad 1 — BUG CRÍTICO en `backend/src/routes/riders.js` línea ~110: cambiar `req.user.id` por `req.usuario.id` en el endpoint `POST /api/riders/push-subscription`. Una línea, impacto alto. Prioridad 2 — agregar `CREATE INDEX IF NOT EXISTS idx_pagos_flow_token ON pagos(flow_token)` y `CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON pedidos(created_at)` y `idx_pedidos_entregado_at ON pedidos(entregado_at)` al migrate.js y ejecutar en producción. Prioridad 3 — crear `backend/src/routes/productos.js` con CRUD básico (GET/POST/PUT/DELETE) para desbloquear gestión de menú.

- **PARA GERENTE**: El sistema tiene 10 rutas REST operativas y un motor de asignación sofisticado, pero un bug de una línea en riders.js (`req.user.id` vs `req.usuario.id`) bloquea completamente las notificaciones push a riders, lo que puede estar afectando la tasa de primera asignación. Adicionalmente, la feature de pedidos agendados existe en schema y UI pero nunca se activa por falta de scheduler — es trabajo de 2-3 horas que desbloquea un diferenciador competitivo real.
