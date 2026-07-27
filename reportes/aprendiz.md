# Análisis Interno RepartoJusto
**Fecha:** 2026-07-21
**Analista:** Agente Aprendiz

---

## Métricas del sistema
**Sin acceso** — La API de producción no respondió (error de red HTTP 000 a través del proxy en Railway). Se reportan métricas de código únicamente.

---

## Estado de fixes documentados en ciclos anteriores

| Fix | Archivo | Estado |
|---|---|---|
| Bug push-subscription `req.user.id` | `riders.js:183` | ✅ CONFIRMADO APLICADO |
| HMAC webhook Flow | `pagos.js:124-152` | ✅ CONFIRMADO APLICADO |
| Autorización `pedido:seguir` | `sockets/index.js:101` | ❌ PENDIENTE EN CÓDIGO |
| Autorización `chat:enviar` | `sockets/index.js:161` | ❌ PENDIENTE EN CÓDIGO |
| Memory leak rate limiter | `auth.js:10-31` | ❌ PENDIENTE EN CÓDIGO |
| Paginación liquidaciones | `admin.js:197` | ❌ PENDIENTE EN CÓDIGO |
| Throttle `rider:ubicacion` DB | `sockets/index.js:67` | ❌ PENDIENTE EN CÓDIGO |
| 4 índices faltantes | `migrate.js` | ❌ PENDIENTE EN CÓDIGO |
| Guard clause `neg` nulo en cancelar | `pedidos.js:317` | ❌ PENDIENTE EN CÓDIGO |

---

## Nuevos patrones detectados esta semana

### 1. `INSERT INTO pagos` con columnas inexistentes — incentivo audit trail nunca se graba
**Archivo:** `backend/src/routes/admin.js:290`

El endpoint `POST /api/admin/riders/:id/incentivo` intenta registrar un log del bono en la tabla `pagos`:

```sql
INSERT INTO pagos (pedido_id, rider_id, tipo, monto, estado, metadata)
```

Las columnas `rider_id`, `tipo` y `metadata` **no existen en la tabla `pagos`** (confirmado en `migrate.js`). La tabla solo tiene: `id, pedido_id, flow_order_id, flow_token, monto, estado, pagado_at, created_at, updated_at`. El error es capturado silenciosamente por `.catch(() => {})` en la línea 295. Resultado: **cada bono de incentivo otorgado a riders no deja trazabilidad**. El saldo se acredita correctamente, pero no hay audit trail.

### 2. `RESIDUAL_PCT` hardcodeado en frontend, ignorado en backend
**Archivo:** `backend/src/config/index.js:46`, `backend/public/rider.html:2061`, `rider.html:1772`

`config/index.js` define `RESIDUAL_PCT: 8` pero ningún módulo del backend la usa. En cambio, los HTMLs del frontend tienen `const RESIDUAL_PCT = 8` **hardcodeado como literal**. Si Matías cambia el valor en la variable de entorno o en config.js, el frontend no se actualiza. Requiere decisión: o pasar el valor vía API o limpiar la variable del config.

### 3. Patrón Mejoras: código correcto documentado pero nunca aplicado (8+ semanas)
**Evidencia:** git log muestra que el commit `53b1b0a` del 2026-07-20 (Mejoras) solo modificó `reportes/mejoras.md`, sin tocar ningún `.js`. El patrón se repite: `7b3a7d8` del 13/07, `c259dd4` del 06/07, todos solo tocan el `.md`. Los 7 fixes de las últimas 3 semanas existen como código correcto en `mejoras.md` pero ninguno fue copiado a los archivos fuente.

---

## Ineficiencias concretas

| Archivo:Línea | Problema | Impacto estimado |
|---|---|---|
| `admin.js:197` | `LIMIT 100` hardcoded sin paginación | Vista incompleta cuando superen 100 liquidaciones |
| `admin.js:290` | INSERT con columnas inexistentes, silenciado | Audit trail de incentivos nunca grabado |
| `auth.js:24-65` | Map en memoria sin purge de entradas expiradas | Memory leak bajo tráfico sostenido sin Redis |
| `sockets/index.js:67` | UPDATE + SELECT en cada evento GPS sin throttle | ~40+ queries/seg con 20 riders activos |
| `sockets/index.js:101` | `pedido:seguir` sin check de pertenencia | Cualquier usuario espía GPS de pedidos ajenos |
| `sockets/index.js:161` | `chat:enviar` sin verificar pertenencia al pedido | Cualquier usuario inyecta mensajes en chats ajenos |
| `migrate.js` (fin) | Faltan 4 índices: `idx_pagos_flow_token`, `idx_pedidos_created_at`, `idx_pedidos_entregado_at`, `idx_pedidos_hora_retiro` | Full scans en webhooks, métricas y scheduler |
| `pedidos.js:317` | `neg.id` sin guard — crash 500 si cuenta corrompida | TypeError con stack trace visible al cliente |
| `riders.js:85-91` | Doble query (rider id, luego pedidos) cuando JOIN basta | 2× latencia en historial del rider |
| `config/index.js:46` | `RESIDUAL_PCT` definido pero nunca usado en backend | Variable huérfana; frontend la hardcodea |

---

## Oportunidades de mejora basadas en datos

1. **Aplicar código de mejoras.md directamente al código** — El bloqueo no es calidad sino ejecución. El Agente Mejoras necesita hacer el copy-paste al fuente, no solo al .md. Evidencia: 8+ semanas sin salida a producción.

2. **Audit trail de bonos/incentivos** — El endpoint acredita saldo correctamente pero no deja registro. Solución mínima: agregar `rider_id TEXT, tipo VARCHAR(30), metadata JSONB` a migrate.js y ejecutar. Impacto: transparencia contable real para riders.

3. **Throttle GPS a 5s en sockets** — Reducción del ~80% en writes a DB sin impacto en UX del mapa. Código correcto ya escrito en mejoras.md:120-156. Solo falta aplicarlo.

4. **Índice `idx_pedidos_hora_retiro` es el más urgente** — El scheduler de agendados corre query en `hora_retiro` cada ~60s haciendo full scan. De los 4 índices pendientes, este impacta directamente una query recurrente en producción.

5. **Conectar `RESIDUAL_PCT` al backend** — Si la lógica del 8% residual va a usarse en liquidaciones reales, debe calcularse en el servidor. Requiere decisión de Matías antes de producción.

---

## Mensajes para otros agentes

- **PARA MEJORAS:** CRÍTICO — los 7 fixes documentados en mejoras.md **no fueron aplicados al código fuente** (commit 53b1b0a del 20/07 solo modificó mejoras.md). Aplica en este orden: (1) `sockets/index.js:101` auth `pedido:seguir`; (2) `sockets/index.js:161` auth `chat:enviar`; (3) `sockets/index.js:67` throttle ubicación; (4) `auth.js:10-31` purge setInterval; (5) `admin.js:197` paginación; (6) `pedidos.js:317` guard clause `neg` nulo; (7) `migrate.js` tras línea 204 agregar `CREATE INDEX IF NOT EXISTS idx_pagos_flow_token ON pagos(flow_token)`, `idx_pedidos_created_at ON pedidos(created_at)`, `idx_pedidos_entregado_at ON pedidos(entregado_at)`, `idx_pedidos_hora_retiro ON pedidos(hora_retiro)`. NUEVO esta semana: (8) `admin.js:290` el INSERT de incentivo usa columnas `rider_id, tipo, metadata` que no existen en `pagos` — audit trail nunca se graba; solución: agregar esas columnas en migrate.js O crear tabla `bonos_riders`.

- **PARA GERENTE:** 2 fixes nuevos confirmados esta semana (push-subscription ✅ y HMAC webhook ✅). El Agente Mejoras sigue sin aplicar código al fuente (8+ semanas, patrón confirmado por git). Hallazgo nuevo: el audit trail de bonos de incentivo a riders está completamente roto desde que se creó el endpoint (admin.js:290 INSERT silenciado). `RESIDUAL_PCT: 8` en config nunca llega al backend; el frontend lo hardcodea — requiere decisión de Matías antes de producción.
