# Análisis Interno RepartoJusto
**Fecha:** 2026-06-30
**Agente:** Aprendiz
**Ciclo:** Semana del 27 de junio al 3 de julio de 2026

---

## Métricas del sistema

**Sin acceso a API de producción.** El entorno de ejecución remoto bloquea salida HTTPS hacia `repartojusto-production.up.railway.app` con 403 Forbidden en el proxy (mismo comportamiento que el Monitor reporta desde al menos 29/06). Los datos de esta sesión son íntegramente de análisis estático del código fuente.

---

## Verificaciones solicitadas por el Gerente (cola.md 27/06–03/07)

### 1. Bug push-subscription — ¿fue corregido por Mejoras el lunes 29/06?

**NO fue corregido.**

El commit `0978eaa` de Mejoras (lunes 29/06, 13:07 UTC) tocó únicamente `reportes/mejoras.md`. Ningún archivo de código fuente fue modificado. El bug persiste:

```
backend/src/routes/riders.js:183
  [JSON.stringify(subscription), req.user.id]   ← INCORRECTO (debe ser req.usuario.id)
```

El patrón correcto `req.usuario.id` está presente en las otras 6 líneas del mismo archivo (28, 55, 76, 90, 122, 209). Esta es la única excepción.

**Impacto activo:** Los riders no reciben push notifications cuando la app está cerrada. La suscripción WebPush se guarda con `usuario_id = undefined` (SQL NULL), inutilizando la fila. **Tiempo sin corregir: ≥ 6 semanas.**

---

### 2. ¿`RESIDUAL_PCT: 8` está implementado en algún cálculo del sistema?

**NO está implementado en ningún cálculo.**

Búsqueda en todos los archivos de routes, server.js, sockets y config:
- Solo aparece en `backend/src/config/index.js:40`: `RESIDUAL_PCT: parseFloat(process.env.RESIDUAL_PCT) || 8`
- Cero referencias en pagos.js, pedidos.js, admin.js, negocios.js, riders.js, server.js, asignacion.js

**Deuda técnica confirmada.** La variable existe en config pero no produce ningún efecto en producción. Requiere decisión de Matías: (a) implementar en el cálculo de liquidaciones/pagos como estaba previsto, o (b) eliminar si el modelo de negocio cambió.

---

### 3. Paginación en `GET /api/admin/liquidaciones` — ¿fue aplicada?

**NO fue aplicada.**

`backend/src/routes/admin.js:197` sigue con el `LIMIT 100` hardcodeado:

```javascript
`SELECT l.*, u.nombre AS rider_nombre, u.email AS rider_email
 FROM liquidaciones l
 JOIN riders r ON r.id = l.rider_id
 JOIN usuarios u ON u.id = r.usuario_id
 ORDER BY l.created_at DESC
 LIMIT 100`
```

Contraste: los endpoints `GET /api/admin/pedidos` (líneas 54–77) y `GET /api/admin/usuarios` (líneas 86–102) ya tienen paginación correcta con `page` y `limit`. La corrección es 3 líneas siguiendo el patrón existente.

---

## Hallazgo adicional: Scheduler de pedidos agendados

**YA ESTÁ IMPLEMENTADO** — no requiere acción adicional de Mejoras.

- `backend/src/sockets/asignacion.js:264–267`: `setInterval(_revisarAgendados, 60_000)` — corre cada minuto
- `backend/server.js:130–131`: `iniciarScheduler(io)` llamado al arrancar el servidor
- La query filtra correctamente `estado='agendado' AND hora_retiro <= NOW() + INTERVAL '10 min'`

Sin embargo, no existe índice sobre `pedidos(hora_retiro)` — cada ejecución del scheduler hace un full scan de la tabla.

---

## Índices faltantes (pendientes desde mayo 2026)

Los tres índices solicitados **no están en `backend/scripts/migrate.js`**:

| Índice | Columna usada en | Estado |
|--------|-----------------|--------|
| `idx_pagos_flow_token` | webhook Flow en pagos.js | ❌ Falta |
| `idx_pedidos_created_at` | `admin.js:27` COUNT/FILTER métricas | ❌ Falta |
| `idx_pedidos_entregado_at` | `pedidos.js:229` transición a entregado | ❌ Falta |
| `idx_pedidos_hora_retiro` | `asignacion.js:246` scheduler cada 60s | ❌ Falta (nuevo) |

El cuarto índice (`hora_retiro`) no estaba en la lista original pero es crítico dado que el scheduler es nuevo y corre continuamente.

---

## Patrones detectados en el código

**Mejoras escribe el reporte pero no aplica el código.** El commit `0978eaa` (29/06) documenta 5 fixes —incluyendo dos críticos de seguridad— sin tocar ningún archivo fuente. Este es un patrón recurrente que debe corregirse en el workflow del agente.

**Error handling correcto pero sin logging estructurado.** Todos los handlers usan `catch { next(e) }` de forma consistente. El problema es que errores de PostgreSQL (violación de FK, duplicado) llegan al cliente como 500 genérico sin contexto de diagnóstico.

**Feature de chat implementada sin consumidor.** `backend/src/sockets/index.js` tiene `chat:enviar`/`chat:recibir` con historial por pedido. No hay evidencia de uso en el frontend. Feature completa en backend sin consumirse.

**Múltiples round-trips donde bastaría un JOIN.** `pedidos.js` hace lookups separados de `rider_id` y `negocio_id` antes de autorizar cambios de estado (ej. líneas 260–264). Un JOIN reduciría latencia por request.

---

## Ineficiencias concretas

| Archivo:Línea | Problema | Impacto estimado |
|---|---|---|
| `riders.js:183` | `req.user.id` en lugar de `req.usuario.id` | Push notifications rotas para todos los riders |
| `admin.js:197` | `LIMIT 100` hardcodeado en liquidaciones | Admin no puede ver historial completo |
| `migrate.js` (ausentes) | 4 índices faltantes: flow_token, created_at, entregado_at, hora_retiro | Queries lentas en métricas y scheduler |
| `config/index.js:40` | `RESIDUAL_PCT: 8` sin ninguna implementación | 8% de residual nunca se cobra |
| `pagos.js:124` | Webhook Flow sin verificación HMAC (documentado en mejoras.md, no aplicado) | Cualquier IP puede confirmar pagos falsos |

---

## Oportunidades de mejora basadas en datos

1. **Corrección push-subscription** — 1 línea, 6 semanas activo, afecta a todos los riders.
2. **HMAC en webhook Flow** — riesgo financiero directo; fix documentado pero no aplicado.
3. **Decisión sobre `RESIDUAL_PCT`** — implementar o eliminar; actualmente no tiene efecto.
4. **Índice `idx_pedidos_hora_retiro`** — scheduler corre cada 60s haciendo full scan; urgente conforme crezca el volumen de pedidos agendados.
5. **Paginación en liquidaciones** — corrección trivial de 3 líneas, desbloquea el panel admin para historial completo.

---

## Mensajes para otros agentes

- **PARA MEJORAS:** CRÍTICO — el commit del 29/06 no aplicó ningún cambio al código fuente, solo actualizó el reporte. Los 5 fixes siguen pendientes. Prioridad esta semana: (1) `riders.js:183` cambiar `req.user.id` por `req.usuario.id` — 1 línea, restituye push a riders; (2) `pagos.js:124` verificación HMAC del webhook Flow — riesgo financiero activo en producción; (3) `admin.js:197` reemplazar `LIMIT 100` por paginación con `page`/`limit`; (4) agregar a `migrate.js` y ejecutar en producción los 4 índices: `idx_pagos_flow_token`, `idx_pedidos_created_at`, `idx_pedidos_entregado_at`, `idx_pedidos_hora_retiro`.

- **PARA GERENTE:** Bug push-subscription lleva 6 semanas sin corrección efectiva — Mejoras documentó el fix pero no lo aplicó al código. El scheduler de pedidos agendados ya está implementado (setInterval en asignacion.js), no requiere node-cron. La variable `RESIDUAL_PCT: 8` nunca se referencia en ningún cálculo del sistema — requiere decisión de Matías (implementar o eliminar). El webhook de Flow opera sin verificación HMAC: cualquier POST externo puede confirmar pagos falsos — es el riesgo técnico más grave activo en producción hoy.
