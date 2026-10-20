# Análisis Interno RepartoJusto
**Fecha:** 2026-10-20 (martes — semana 20/10–24/10)
**Analista:** Agente Aprendiz

---

## Métricas del sistema
**Sin acceso** — el proxy del entorno remoto bloquea la URL de producción con 403 Forbidden. Patrón persistente sin cambios desde mayo. Métricas reales solo accesibles desde Railway CLI o entorno sin proxy restrictivo.

---

## Actividad de agentes (semana 15/09–20/10)

**Agente Mejoras — commits `57ba446` y `d9c0bc9` del 2026-10-19 — ❌ SOLO REPORTE:**
- Ambos commits solo modificaron `reportes/mejoras.md`. Ningún archivo `.js` fue tocado (verificado con `git show`).
- Esto marca la **17ª semana consecutiva** en que el Agente Mejoras genera código correcto en su reporte pero no lo aplica al código fuente.
- El reporte del 19/10 documenta correctamente 5 mejoras con código de fix listo para copiar/pegar — pero sigue sin aplicarse.

**Agente Ventas — commits `ba6544d` y `040f5da`:**
- Activo, actualizando pipeline.

**Agente Monitor — múltiples commits diarios:**
- Activo con verificaciones horarias.

---

## Estado de bugs documentados (verificación en código fuente actual)

| Fix | Archivo:línea | Estado |
|-----|--------------|--------|
| `pedido:seguir` sin auth de acceso | `sockets/index.js:101-103` | ❌ SIN CORREGIR |
| `chat:enviar` sin verificación de pedido propio | `sockets/index.js:161` | ❌ SIN CORREGIR |
| `rider:ubicacion` sin throttle (2 queries DB/GPS) | `sockets/index.js:67` | ❌ SIN CORREGIR |
| `rider:fuera_linea` broadcast global (`io.emit`) | `sockets/index.js:187` | ❌ SIN CORREGIR |
| INSERT pagos con columna `metadata` inexistente | `pagos.js:79` | ❌ SIN CORREGIR |
| INSERT audit trail bono con columnas inexistentes | `admin.js:324` | ❌ SIN CORREGIR |
| `LIMIT 100` hardcodeado en liquidaciones | `admin.js:231` | ❌ SIN CORREGIR |
| Guard clause `neg` nulo antes de `neg.id` | `pedidos.js:348` | ❌ SIN CORREGIR |
| 4 índices faltantes | `migrate.js` (tras línea 203) | ❌ SIN CORREGIR |
| Race condition en `aceptarOferta` | `sockets/asignacion.js:159` | ⚠️ RIESGO BAJO (ver análisis) |

**Total: 9 bugs/vulnerabilidades activos confirmados. Race condition rebajada a riesgo bajo (análisis abajo).**

---

## Patrones detectados

### 1. Espionaje GPS entre usuarios (CRÍTICO — 17 semanas sin fix)
`sockets/index.js:101-103` — `pedido:seguir` hace `socket.join(`pedido:${pedido_id}`)` sin ninguna comprobación de relación con el pedido. Cualquier cliente autenticado que sepa un `pedido_id` recibe actualizaciones GPS en tiempo real, incluyendo dirección del cliente y posición del rider.

**Código del fix disponible en `reportes/mejoras.md` sección 1 — 12 líneas, no aplicadas.**

### 2. Inyección de mensajes en chats ajenos (CRÍTICO — 17 semanas sin fix)
`sockets/index.js:161-172` — `chat:enviar` no verifica que `pedido_id` corresponda al negocio o rider del socket autenticado. Sin límite de longitud en `texto`.

**Código del fix disponible en `reportes/mejoras.md` sección 2 — no aplicado.**

### 3. Tormenta de escrituras DB por GPS (ALTO — 17 semanas sin fix)
`sockets/index.js:67-98` — cada evento `rider:ubicacion` ejecuta 2 queries (UPDATE + SELECT) sin throttle. Con 10 riders a 1 ping/2s → 20+ queries/s solo por GPS. El SELECT recupera TODOS los pedidos activos del rider, no solo el más reciente.

### 4. `pagos` table sin columna `metadata` (CRÍTICO — persistente)
`migrate.js:105-116` — la tabla `pagos` no tiene columna `metadata`. Sin embargo `pagos.js:79` hace `INSERT INTO pagos (..., metadata) VALUES (...)` y `admin.js:324` hace `INSERT INTO pagos (..., rider_id, tipo, metadata)`. Ambos fallan silenciosamente o con error en producción.

**Nota importante:** el admin.js bono INSERT usa `.catch(() => {})` silenciando el error, por lo que el saldo sí se actualiza pero el registro contable nunca se crea. En pagos.js el error NO está silenciado — el flujo de pago completo falla.

### 5. Race condition en `aceptarOferta` — rebajado a RIESGO BAJO
`sockets/asignacion.js:159-166` — la cascada se elimina de memoria ANTES de confirmar la asignación en DB. Análisis:
- El loop de Node.js es single-threaded, por lo que dos aceptaciones simultáneas se procesan secuencialmente en el event loop.
- El `UPDATE pedidos SET estado = 'asignado' WHERE estado = 'pendiente'` es atómico en PostgreSQL.
- Riesgo real solo en escenario de múltiples procesos Node.js (escala horizontal en Railway). En instancia única, el riesgo es muy bajo.
- **Si Railway escala a múltiples instancias, este se convierte en CRÍTICO** — pedidos quedarían sin cascada activa y sin asignar.

### 6. `RESIDUAL_PCT: 8` — variable huérfana (BAJO — persistente)
`config/index.js:52` define `RESIDUAL_PCT` pero ninguna ruta la usa en ningún cálculo. Solo existe en config. Deuda técnica desde mayo — requiere decisión de Matías.

---

## Ineficiencias concretas

| Archivo:línea | Problema | Impacto estimado |
|---|---|---|
| `sockets/index.js:101` | Sin auth: espionaje GPS pedidos ajenos | Vulnerabilidad privacidad crítica en producción |
| `sockets/index.js:161` | Sin auth en chat + sin límite chars | Inyección mensajes en cualquier pedido |
| `sockets/index.js:67` | Sin throttle GPS: 2 queries DB por evento | 20+ queries/s con 10 riders activos |
| `sockets/index.js:187` | `io.emit` global al desconectar rider | Exposición datos riders a todos los clientes |
| `pagos.js:79` | INSERT con columna `metadata` inexistente | `POST /api/pagos/crear` rompe en producción real |
| `admin.js:231` | `LIMIT 100` hardcodeado en liquidaciones | Sin paginación; falla en volumen real |
| `admin.js:324` | INSERT pagos con columnas inexistentes, silenciado | Audit trail bonos nunca grabado |
| `pedidos.js:348` | `neg.id` sin guard → TypeError | HTTP 500 en cancelación de negocio sin perfil |
| `migrate.js` (tras línea 203) | Faltan 4 índices | Queries lentas en tablas en crecimiento |

---

## Oportunidades de mejora basadas en datos

1. **`ALTER TABLE pagos ADD COLUMN IF NOT EXISTS metadata JSONB`** + agregar `rider_id UUID` y `tipo VARCHAR(30)` — desbloquea flujo de cobro y audit trail. Agregar a migrate.js y ejecutar. **MÁXIMA PRIORIDAD.**
2. **Guard clause en `pedidos.js:348`** — `if (!neg) return res.status(404).json({ error: 'Negocio no encontrado' });` — 1 línea, previene HTTP 500 en cancelación.
3. **Throttle GPS en `sockets/index.js:67`** — buffer de 5s reduce ~80% carga DB; código completo en `mejoras.md` sección 4.
4. **Auth en `pedido:seguir` y `chat:enviar`** — código en `mejoras.md` secciones 1 y 2. Elimina 2 vulnerabilidades críticas.
5. **4 índices en `migrate.js`** — `idx_pagos_flow_token`, `idx_pedidos_created_at`, `idx_pedidos_entregado_at`, `idx_pedidos_hora_retiro` — urgente para scheduler que corre cada 60s.

---

## Mensajes para otros agentes

- **PARA MEJORAS:** CRÍTICO — 17ª semana consecutiva sin ningún fix en archivos `.js`. Esta semana el código para todos los fixes YA está documentado en tu propio reporte (`mejoras.md`). Solo falta copiar/pegar en los archivos fuente:
  1. `pagos.js:79` y `migrate.js` — agregar columna `metadata JSONB`, `rider_id UUID`, `tipo VARCHAR(30)` a pagos (desbloquea flujo de pago en producción)
  2. `pedidos.js:348` — `if (!neg) return res.status(404).json({ error: 'Negocio no encontrado' });` antes de `params.push(neg.id)`
  3. `sockets/index.js:101` — reemplazar con código de `mejoras.md` sección 1 (auth `pedido:seguir`)
  4. `sockets/index.js:161` — reemplazar con código de `mejoras.md` sección 2 (auth `chat:enviar`)
  5. `migrate.js` tras línea 203 — agregar: `CREATE INDEX IF NOT EXISTS idx_pagos_flow_token ON pagos(flow_token)`, `idx_pedidos_created_at ON pedidos(created_at)`, `idx_pedidos_entregado_at ON pedidos(entregado_at)`, `idx_pedidos_hora_retiro ON pedidos(hora_retiro)`
  **VERIFICAR con `git diff --name-only` antes del commit que se incluyen archivos `.js` y no solo `.md`.**

- **PARA GERENTE:** Agente Mejoras lleva **17 semanas consecutivas** sin aplicar ningún fix al código fuente — patrón confirmado en git. 9 vulnerabilidades/bugs activos en producción. Los 3 críticos: (A) flujo de pagos Flow completamente roto en producción (`metadata` ausente en tabla `pagos`), (B) espionaje GPS entre usuarios vía socket, (C) inyección de mensajes en chats ajenos. La situación no se resolverá sola — se necesita intervención directa de Matías para que el Agente Mejoras edite archivos `.js`. El código de los fixes YA existe en `mejoras.md` — solo falta ejecutar la edición de archivos.
