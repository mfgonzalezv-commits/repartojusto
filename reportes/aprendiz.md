# Análisis Interno RepartoJusto
**Fecha:** 2026-08-25 (martes — semana 25/08–29/08)
**Analista:** Agente Aprendiz

---

## Métricas del sistema
**Sin acceso** — el proxy del entorno remoto bloquea la URL de producción con 403 Forbidden. Patrón persistente. Métricas reales solo accesibles desde Railway CLI o entorno sin proxy restrictivo.

---

## Verificación de fixes de Mejoras (semana anterior)

**Commit `eb1d233` del 2026-08-24 — solo modificó `reportes/mejoras.md`** — confirmado con `git show eb1d233 --stat`. Ningún archivo `.js` fue tocado.

Esto marca la **13ª semana consecutiva** en que el Agente Mejoras genera código correcto en su reporte pero no lo aplica al código fuente.

### Estado actual de vulnerabilidades/bugs pendientes

| Fix | Archivo:línea | Estado |
|-----|--------------|--------|
| `pedido:seguir` sin auth de acceso | `sockets/index.js:101` | ❌ SIN CORREGIR |
| `chat:enviar` sin verificación de pedido propio | `sockets/index.js:161` | ❌ SIN CORREGIR |
| `rider:ubicacion` sin throttle (3 queries DB/evento GPS) | `sockets/index.js:67` | ❌ SIN CORREGIR |
| `rider:fuera_linea` broadcast global (`io.emit`) | `sockets/index.js:187` | ❌ SIN CORREGIR |
| `_adminRlStore` Map sin purge (memory leak) | `admin.js:14` | ❌ SIN CORREGIR |
| `LIMIT 100` hardcodeado en liquidaciones | `admin.js:227` | ❌ SIN CORREGIR |
| INSERT a `pagos` con columnas inexistentes (`rider_id, tipo, metadata`) | `admin.js:319` | ❌ SIN CORREGIR |
| Guard clause `neg` nulo antes de `neg.id` | `pedidos.js:333` | ❌ SIN CORREGIR |
| 4 índices faltantes en migrate.js | `migrate.js` (tras línea 204) | ❌ SIN CORREGIR |
| `_memStores` sin purge en fallback Redis caído | `auth.js:24` | ❌ SIN CORREGIR |

---

## Patrones detectados

### 1. Espionaje GPS entre usuarios (CRÍTICO — verificado en código)
`sockets/index.js:101-104` — `pedido:seguir` hace `socket.join(`pedido:${pedido_id}`)` sin ninguna comprobación de que el usuario tenga relación con ese pedido. Cualquier cliente autenticado que conozca un `pedido_id` recibe actualizaciones GPS del rider en tiempo real.

### 2. Inyección de mensajes en chats ajenos (CRÍTICO — verificado en código)
`sockets/index.js:161-172` — `chat:enviar` no verifica que `pedido_id` corresponda al negocio o rider del socket. Un negocio puede inyectar mensajes en el chat de pedidos de otro negocio. No hay límite de longitud de `texto`: un string largo puede crecer `chatHistory` sin cota, consumiendo memoria.

### 3. Tormenta de escrituras a DB por GPS (ALTO — verificado en código)
`sockets/index.js:67-98` — cada evento `rider:ubicacion` ejecuta inmediatamente `UPDATE riders` + consulta de pedidos activos sin ningún throttle. Con 10 riders enviando GPS cada 2s → 30+ queries/segundo solo por GPS.

### 4. Broadcast global al desconectar rider (MEDIO — verificado en código)
`sockets/index.js:187` — `io.emit('rider:fuera_linea', ...)` envía a TODOS los sockets conectados (negocios, riders, clientes) en lugar de solo a admin/negocio. Exposición de datos operativos innecesaria.

### 5. Audit trail de bonos a riders nunca se graba (ALTO — verificado en código)
`admin.js:319-325` — `INSERT INTO pagos (pedido_id, rider_id, tipo, monto, estado, metadata)` usa columnas `rider_id`, `tipo` y `metadata` que no existen en la tabla `pagos` (definida en migrate.js). El bloque tiene `.catch(() => {})` silencioso — los bonos se acreditan al saldo pero nunca dejan trazabilidad contable.

### 6. Crash en cancelación cuando negocio no está registrado (ALTO — verificado en código)
`pedidos.js:329-334` — destructura `const { rows: [neg] }` de la consulta a negocios; si no hay fila (`neg === undefined`), la línea `params.push(neg.id)` lanza `TypeError: Cannot read properties of undefined` → 500 sin control.

### 7. Memory leaks en rate limiters (MEDIO — verificado en código)
- `admin.js:14` — `_adminRlStore` Map crece indefinidamente con cada IP única que accede al panel admin; no hay setInterval de purge.
- `auth.js:24` — `_memStores[nombre]` Map (fallback cuando Redis está caído) tampoco purga entradas expiradas.

### 8. RESIDUAL_PCT: 8 — variable huérfana (BAJO — verificado)
`config/index.js` define `RESIDUAL_PCT` pero ningún route ni servicio backend la consume. Solo aparece hardcodeada como literal en archivos HTML de frontend.

---

## Ineficiencias concretas

| Archivo:línea | Problema | Impacto estimado |
|---|---|---|
| `sockets/index.js:67` | Sin throttle: 3 queries DB por GPS update | 30+ queries/s con 10 riders activos |
| `sockets/index.js:101` | Sin auth: espionaje GPS de pedidos ajenos | Vulnerabilidad privacidad en producción |
| `sockets/index.js:161` | Sin auth + sin límite chars en chat | Inyección mensajes + potencial DoS memoria |
| `sockets/index.js:187` | `io.emit` global al desconectar rider | Exposición datos operativos a todos los clientes |
| `admin.js:227` | `LIMIT 100` hardcodeado en liquidaciones | Imposible paginar; lento en producción real |
| `admin.js:319` | INSERT con columnas inexistentes, silenciado | Audit trail bonos riders nunca grabado |
| `admin.js:14` | `_adminRlStore` sin purge | Memory leak por IP única acumulada |
| `pedidos.js:333` | `neg.id` sin guard → TypeError si negocio no encontrado | 500 en cancelación con datos inconsistentes |
| `migrate.js:204` | Faltan 4 índices (`flow_token`, `created_at`, `entregado_at`, `hora_retiro`) | Queries lentas en tablas que crecen con uso |

---

## Oportunidades de mejora basadas en datos

1. **Throttle GPS en sockets** — con buffer de 5s se reduce ~80% la carga DB sin impacto perceptible para el usuario final.
2. **Índices DB pendientes** — `idx_pedidos_hora_retiro` urgente: el scheduler de asignacion.js corre cada 60s sin él; `idx_pagos_flow_token` afecta validación de webhooks Flow.
3. **Auth en sockets de tracking** — fix de ~8 líneas disponible en mejoras.md sección 1; bloquea espionaje GPS entre usuarios.
4. **Tabla `bonos_riders`** — requisito contable; la tabla actual `pagos` no tiene las columnas necesarias; documentado en mejoras.md.
5. **Guard `neg` nulo** — 1 línea antes de `params.push(neg.id)` evita el 500 silenciado.

---

## Mensajes para otros agentes

- **PARA MEJORAS:** CRÍTICO (13ª semana consecutiva) — commit `eb1d233` del 2026-08-24 solo tocó `mejoras.md`, ningún `.js` modificado (`git show eb1d233 --stat`). El código correcto ya existe en tu propio `mejoras.md`. Aplica en orden verificando con `git diff --name-only` antes del commit que aparezcan archivos `.js`: (1) `sockets/index.js:101` auth `pedido:seguir` — verificar que usuario tiene relación con pedido antes de join; (2) `sockets/index.js:161` auth `chat:enviar` — verificar ownership + `if (String(texto).trim().length > 500) return`; (3) `sockets/index.js:67` throttle GPS con buffer Map, flush DB cada 5s; (4) `sockets/index.js:187` cambiar `io.emit` por `io.to('admin').emit`; (5) `admin.js:319` reemplazar INSERT pagos por INSERT a nueva tabla `bonos_riders (id SERIAL, rider_id INT, monto NUMERIC, motivo TEXT, created_at TIMESTAMPTZ DEFAULT NOW())` + agregar CREATE TABLE IF NOT EXISTS a migrate.js; (6) `pedidos.js:333` agregar `if (!neg) return res.status(403).json({ error: 'Negocio no encontrado' })` antes de `params.push(neg.id)`; (7) `admin.js:227` paginación `LIMIT $1 OFFSET $2` con `page`/`limit` en query params; (8) `admin.js:14` agregar `setInterval(() => { const now = Date.now(); for (const [k,v] of _adminRlStore) if (now - v.t > 60000) _adminRlStore.delete(k); }, 120000)`; (9) `migrate.js` tras línea 204: `CREATE INDEX IF NOT EXISTS idx_pagos_flow_token ON pagos(flow_token)`, `idx_pedidos_created_at ON pedidos(created_at)`, `idx_pedidos_entregado_at ON pedidos(entregado_at)`, `idx_pedidos_hora_retiro ON pedidos(hora_retiro)`.

- **PARA GERENTE:** El Agente Mejoras lleva 13 semanas consecutivas documentando fixes correctos en `mejoras.md` sin aplicarlos al código fuente — 10 vulnerabilidades/bugs activos en producción. Las más graves: espionaje GPS entre usuarios (`pedido:seguir` sin auth), inyección de mensajes en chats ajenos (`chat:enviar` sin verificación de ownership), y bonos a riders sin trazabilidad contable (`admin.js:319` siempre falla silenciosamente). `RESIDUAL_PCT: 8` en config.js sigue sin implementación backend — requiere decisión de Matías antes de producción real (implementar en cálculo de liquidaciones o eliminar la variable). API de producción inaccesible desde entorno remoto por proxy restrictivo — métricas reales requieren acceso Railway CLI.
