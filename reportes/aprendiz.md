# Análisis Interno RepartoJusto
**Fecha:** 2026-06-23
**Agente:** Aprendiz

---

## Métricas del sistema

Sin acceso directo a la API de producción — el host `repartojusto-production.up.railway.app` no está en el allowlist de red del entorno de ejecución. Análisis basado en código fuente y git log.

---

## Verificaciones específicas encargadas (cola.md semana 16-22/05)

### 1. Bug push-subscription — NO CORREGIDO

**Estado:** Bug sigue activo en producción.

`backend/src/routes/riders.js:183` — El endpoint `POST /api/riders/push-subscription` usa `req.user.id` en lugar de `req.usuario.id`:

```js
// ACTUAL (línea 183) — lanza TypeError en cada intento de suscripción:
[JSON.stringify(subscription), req.user.id]
```

El reporte de Mejoras del 2026-06-22 identificó el problema correctamente pero no aplicó la corrección en el código. Los riders siguen sin poder recibir notificaciones push cuando la app está cerrada. Corrección pendiente de 1 línea.

---

### 2. LIMIT 100 en /api/admin/liquidaciones — CONFIRMADO, sin paginación

**Archivo:** `backend/src/routes/admin.js` — endpoint `GET /api/admin/liquidaciones`

```js
// Sin parámetros de paginación:
LIMIT 100
```

El endpoint no acepta `page` ni `limit` como query params. A medida que la plataforma escale y haya más liquidaciones registradas, las más antiguas quedarán invisibles para el admin sin ningún aviso al usuario. Corrección necesaria: agregar paginación estándar `page/limit` idéntica a los otros endpoints de admin.

**Corrección sugerida para Mejoras:**
```js
// Agregar a destructuring de req.query:
const { page = 1, limit = 50 } = req.query;
const offset = (page - 1) * limit;
// Reemplazar query con parámetros:
ORDER BY l.created_at DESC
LIMIT $1 OFFSET $2
// params: [limit, offset]
```

---

### 3. RESIDUAL_PCT: 8 — DEUDA TÉCNICA confirmada

**Archivo:** `backend/src/config/index.js:40`

```js
RESIDUAL_PCT: parseFloat(process.env.RESIDUAL_PCT) || 8,
```

La variable existe en config pero **no es referenciada en ningún archivo de rutas ni de sockets**. Búsqueda exhaustiva en `backend/src/` confirma cero usos. No hay cálculo de residual en pedidos, pagos ni liquidaciones. Esto parece ser un modelo de negocio que no llegó a implementarse.

**Acción para Matías:** Decidir si activar el 8% residual (implica cambios en `pedidos.js` al crear pedido y en `admin.js` al calcular ingresos) o documentarlo como feature descartada para no generar confusión futura.

---

## Patrones detectados en el código

### Scheduler de pedidos agendados — IMPLEMENTADO correctamente

`backend/src/sockets/asignacion.js:264` — `iniciarScheduler` usa `setInterval` cada 60 segundos y consulta pedidos con `estado='agendado'` cuya `hora_retiro` esté dentro de los próximos `ANTICIPACION_MIN` minutos. El servidor lo lanza en startup (`server.js:132`). Feature funcional.

**Advertencia:** La comparación de `hora_retiro TIME` contra `NOW() AT TIME ZONE 'America/Santiago'::time` puede producir falsos positivos si un pedido se agenda cerca de medianoche (la ventana de 2 minutos hacia atrás puede saltar al día anterior). Sin índice en `(estado, hora_retiro)`, la query hace full scan de la tabla `pedidos` cada minuto.

### Índices faltantes — NO APLICADOS

Los tres índices que Mejoras debía agregar en la semana 19/05 siguen sin estar en `migrate.js`:
- `idx_pagos_flow_token` — necesario en `pagos.js` para el webhook de Flow que busca por token
- `idx_pedidos_created_at` — necesario en `admin/metricas/ingresos` y `admin/pedidos`
- `idx_pedidos_entregado_at` — necesario en `admin/liquidar` y cálculo de saldo rider

### Error silencioso en incentivos

`backend/src/routes/admin.js` — endpoint `POST /api/admin/riders/:id/incentivo`: el INSERT en `pagos` hace `.catch(() => {})` que descarta silenciosamente errores sin log. Si el INSERT falla (por ejemplo, si el rider no tiene pedidos entregados), el admin no recibe ninguna señal de que el registro de pago falló, aunque el saldo sí se actualiza.

### Panel desglose liquidaciones para negocios — NO IMPLEMENTADO

`GET /api/negocios/resumen` devuelve solo KPIs agregados (total entregados, gasto_total, gasto_plataforma, gasto_envios, pedidos por día). No hay desglose por pedido individual (fecha, monto, tarifa cobrada, neto negocio). El Investigador validó que esta es la queja #1 de negocios contra Rappi/PedidosYa. Feature pendiente de alta prioridad.

---

## Ineficiencias concretas

| Archivo:línea | Problema | Impacto estimado |
|---|---|---|
| `src/routes/riders.js:183` | `req.user.id` → `req.usuario.id` — TypeError en prod | Riders sin push notifications (100% de falla) |
| `src/routes/admin.js:~170` | `LIMIT 100` hardcodeado en liquidaciones sin paginación | Ocultamiento de datos al escalar |
| `scripts/migrate.js` | Faltan `idx_pagos_flow_token`, `idx_pedidos_created_at`, `idx_pedidos_entregado_at` | Full scan en queries frecuentes de admin y Flow |
| `src/sockets/asignacion.js:240` | Full scan pedidos cada 60s sin índice en `(estado, hora_retiro)` | Degradación progresiva con volumen de pedidos agendados |
| `src/config/index.js:40` | `RESIDUAL_PCT` definido pero nunca usado | Confusión de modelo de negocio / deuda técnica |
| `src/routes/admin.js` incentivo | `.catch(() => {})` silencia error de INSERT en pagos | Auditoría financiera incompleta sin aviso |
| `src/routes/negocios.js:252` | Resumen solo agrega, sin desglose por pedido | Diferenciador de producto no aprovechado |

---

## Oportunidades de mejora basadas en datos

1. **Desglose por pedido en panel negocio** — El Investigador confirmó que es la queja #1 de negocios contra plataformas. El schema ya tiene `cargo_negocio`, `cargo_cliente`, `tarifa_entrega`, `app_fee` por pedido — solo falta exponerlos en un endpoint `/api/negocios/pedidos?estado=entregado&page=1`.

2. **Índice compuesto en pedidos agendados** — `CREATE INDEX idx_pedidos_agendados ON pedidos(estado, hora_retiro) WHERE estado='agendado'` — eliminaría el full scan del scheduler y mejoraría el rendimiento del webhook de Flow simultáneamente.

3. **Corrección de 1 línea que restaura push notifications** — El bug `req.user.id` en riders.js:183 lleva al menos 5 semanas sin corregirse. Impacto directo en retención de riders que no reciben alertas de nuevos pedidos.

---

## Mensajes para otros agentes

- **PARA MEJORAS:** URGENTE — bug `req.user.id` en `backend/src/routes/riders.js:183` sigue sin corregir (identificado 22/06, no aplicado). Cambiar a `req.usuario.id`. También: agregar paginación a `GET /api/admin/liquidaciones` en `admin.js` — reemplazar `LIMIT 100` por `LIMIT $1 OFFSET $2` con `page/limit` desde query params. Agregar los 3 índices faltantes al migrate.js: `idx_pagos_flow_token ON pagos(flow_token)`, `idx_pedidos_created_at ON pedidos(created_at)`, `idx_pedidos_entregado_at ON pedidos(entregado_at)`.

- **PARA GERENTE:** Bug de push-subscription lleva 5+ semanas sin corregirse a pesar de estar documentado — los riders no reciben alertas de pedidos sin app abierta; corrección es 1 línea. `RESIDUAL_PCT: 8` en config nunca se implementó en ningún cálculo — requiere decisión de Matías antes de activarlo o eliminarlo.
