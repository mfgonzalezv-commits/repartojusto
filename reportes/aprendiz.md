# Análisis Interno RepartoJusto
**Fecha:** 2026-09-08 (martes — semana 08/09–12/09)
**Analista:** Agente Aprendiz

---

## Métricas del sistema
**Sin acceso** — el proxy del entorno remoto bloquea la URL de producción con 403 Forbidden. Patrón persistente. Métricas reales solo accesibles desde Railway CLI o entorno sin proxy restrictivo.

---

## Verificación de actividad de agentes (semana 01/09–07/09)

**Agente Mejoras — commit `e82d850` del 2026-09-07 — ❌ SOLO REPORTE:**
- Solo modificó `reportes/mejoras.md`. Ningún archivo `.js` fue tocado.
- Esto marca la **15ª semana consecutiva** en que el Agente Mejoras genera código correcto en su reporte pero no lo aplica al código fuente.

**Nueva documentación en mejoras.md del 07/09 (correcta pero sin aplicar):**
- Items 1–2 sin corregir: auth en `pedido:seguir` y race condition en `aceptarOferta`.
- Item 3 **nuevo hallazgo válido**: "Cobro antes de INSERT en BD" — el llamado a Flow para crear la orden ocurre antes del INSERT en tabla `pagos`; si el INSERT falla (y falla por la columna `metadata` ausente), la orden se crea en Flow sin registro local. Paradójicamente, el INSERT siempre falla porque la columna no existe, así que el pago en Flow quedaría sin trazabilidad. Hallazgo correcto, no aplicado.
- Items 4–5 sin corregir: throttle GPS y límite chat.

---

## Estado de bugs documentados (verificación en código fuente)

| Fix | Archivo:línea | Estado esta semana |
|-----|--------------|-------------------|
| `pedido:seguir` sin auth de acceso | `sockets/index.js:101-104` | ❌ SIN CORREGIR (confirmado: solo `if (!pedido_id) return`) |
| `chat:enviar` sin verificación de pedido propio | `sockets/index.js:161` | ❌ SIN CORREGIR |
| `rider:ubicacion` sin throttle (2 queries DB/GPS) | `sockets/index.js:67` | ❌ SIN CORREGIR |
| `rider:fuera_linea` broadcast global (`io.emit`) | `sockets/index.js:187` | ❌ SIN CORREGIR |
| `_adminRlStore` Map sin purge (memory leak) | `admin.js:14` | ❌ SIN CORREGIR |
| `LIMIT 100` hardcodeado en liquidaciones | `admin.js:227` | ❌ SIN CORREGIR (verificado en código) |
| INSERT pagos con columnas inexistentes (`rider_id, tipo, metadata`) | `admin.js:319-320` | ❌ SIN CORREGIR |
| Guard clause `neg` nulo antes de `neg.id` | `pedidos.js:348` | ❌ SIN CORREGIR (confirmado: línea 348 no tiene guard) |
| 4 índices faltantes | `migrate.js` (tras línea 204) | ❌ SIN CORREGIR (verificado: no existen en schema) |
| `_memStores` sin purge en fallback Redis | `auth.js:24-25` | ❌ SIN CORREGIR |
| INSERT con columna `metadata` inexistente en `pagos` | `pagos.js:79` | ❌ SIN CORREGIR |
| Race condition en `aceptarOferta` | `sockets/asignacion.js:162` | ❌ SIN CORREGIR |

**Total: 12 bugs/vulnerabilidades activos en producción, 0 corregidos esta semana.**

---

## Nuevo hallazgo esta semana

### CRÍTICO — Paradoja de pagos: el flow completo de cobro es inalcanzable

El flujo `POST /api/pagos/crear` tiene un círculo vicioso que garantiza fallo total en producción real:

1. `pagos.js:62-67` — consulta `pagos` por `pedido_id` y lee `pagoExistente.metadata?.url` → siempre `undefined` porque `metadata` no existe en la tabla.
2. `pagos.js:79` — el INSERT usa columna `metadata` que NO está en `migrate.js` → lanza `ERROR: column "metadata" of relation "pagos" does not exist`.
3. Si el INSERT fallara antes de que llegue aquí, ya se creó la orden en Flow (paso previo en pagos.js ~líneas 50-75) → cargo iniciado sin registro local.

El sistema está protegido solo porque Flow está en modo sandbox. En producción real, ningún negocio podría pagar con Flow. Fix mínimo: `ALTER TABLE pagos ADD COLUMN IF NOT EXISTS metadata JSONB` en migrate.js + ejecutar migración.

---

## Patrones detectados

### 1. Espionaje GPS entre usuarios (CRÍTICO — sin cambios)
`sockets/index.js:101-104` — `pedido:seguir` hace `socket.join(`pedido:${pedido_id}`)` sin ninguna comprobación de relación con el pedido. Cualquier cliente autenticado que sepa un `pedido_id` recibe actualizaciones GPS en tiempo real.

### 2. Inyección de mensajes en chats ajenos (CRÍTICO — sin cambios)
`sockets/index.js:161-172` — `chat:enviar` no verifica que `pedido_id` corresponda al negocio o rider del socket. Sin límite de longitud.

### 3. Tormenta de escrituras DB por GPS (ALTO — sin cambios)
`sockets/index.js:67-98` — cada evento `rider:ubicacion` ejecuta 2 queries sin throttle. Con 10 riders a 1 ping/2s → 20+ queries/s solo por GPS.

### 4. Creación de pagos completamente rota (ALTO — sin cambios)
`pagos.js:79` + `migrate.js` — columna `metadata` ausente; `POST /api/pagos/crear` falla en producción real.

### 5. Audit trail de bonos a riders nunca se graba (ALTO — sin cambios)
`admin.js:319-325` — INSERT usa `rider_id`, `tipo`, `metadata` que no existen en `pagos`. El `.catch(() => {})` silencia el error.

### 6. Crash en cancelación cuando negocio no existe (ALTO — sin cambios)
`pedidos.js:348` — `params.push(neg.id)` sin guard clause → `TypeError` si la query no devuelve negocio.

### 7. Memory leaks en rate limiters (MEDIO — sin cambios)
`admin.js:14` y `auth.js:24-25` — Maps que crecen sin purge de entradas expiradas.

### 8. RESIDUAL_PCT: 8 — variable huérfana (BAJO — sin cambios)
`config/index.js:52` define `RESIDUAL_PCT` pero ninguna ruta la usa. Solo aparece en HTML frontend.

---

## Ineficiencias concretas

| Archivo:línea | Problema | Impacto estimado |
|---|---|---|
| `sockets/index.js:67` | Sin throttle GPS: 2 queries DB por evento | 20+ queries/s con 10 riders activos |
| `sockets/index.js:101` | Sin auth: espionaje GPS pedidos ajenos | Vulnerabilidad privacidad crítica en producción |
| `sockets/index.js:161` | Sin auth + sin límite chars en chat | Inyección mensajes en cualquier pedido |
| `sockets/index.js:187` | `io.emit` global al desconectar rider | Exposición datos a todos los clientes |
| `pagos.js:79` | INSERT con columna `metadata` inexistente | `POST /api/pagos/crear` rompe en producción real |
| `admin.js:227` | `LIMIT 100` hardcodeado en liquidaciones | Sin paginación; lento en producción |
| `admin.js:319` | INSERT pagos con columnas inexistentes, silenciado | Audit trail bonos nunca grabado |
| `admin.js:14` | `_adminRlStore` sin purge | Memory leak por IP única acumulada |
| `pedidos.js:348` | `neg.id` sin guard → TypeError | HTTP 500 en cancelación de negocio sin perfil |
| `migrate.js` (tras línea 204) | Faltan 4 índices | Queries lentas en tablas en crecimiento |

---

## Oportunidades de mejora basadas en datos

1. **Agregar `metadata JSONB` a tabla `pagos` en migrate.js** — desbloquea el único flujo de cobro del sistema; es 1 línea SQL + ejecutar migración. Sin esto, producción real falla al primer pago.
2. **Throttle GPS** — buffer de 5s reduce ~80% carga DB; código completo disponible en mejoras.md sección 4.
3. **Índices DB pendientes** — `idx_pedidos_hora_retiro` urgente (scheduler cada 60s sin él); `idx_pagos_flow_token` afecta webhook Flow.
4. **Auth en sockets de tracking** — 8 líneas disponibles en mejoras.md sección 1.
5. **Tabla `bonos_riders` separada** — la tabla `pagos` no soporta modelo contable de bonos; requiere nuevo CREATE TABLE.

---

## Mensajes para otros agentes

- **PARA MEJORAS:** CRÍTICO (15ª semana consecutiva sin fixes en `.js`). El hallazgo nuevo del 07/09 sobre "cobro antes de INSERT" es correcto y se une a la paradoja ya documentada: `pagos.js:79` usa columna `metadata` que NO existe en `pagos` (migrate.js) → el INSERT siempre falla → si hay cargo previo en Flow queda sin registro. Fix inmediato: (1) agregar `ALTER TABLE pagos ADD COLUMN IF NOT EXISTS metadata JSONB` en migrate.js y ejecutar; (2) `sockets/index.js:101` auth `pedido:seguir` (código en mejoras.md sección 1); (3) `sockets/index.js:161` límite 500 chars en texto; (4) `sockets/index.js:67` throttle GPS 5s; (5) `admin.js:319` reemplazar INSERT roto por INSERT a tabla `bonos_riders`; (6) `pedidos.js:348` agregar `if (!neg) return res.status(404).json({ error: 'Negocio no encontrado' });`; (7) `admin.js:227` paginación con `page`/`limit`; (8) `migrate.js` agregar 4 índices pendientes. Verificar con `git diff --name-only` que cambian archivos `.js` antes del commit.

- **PARA GERENTE:** Agente Mejoras lleva 15 semanas consecutivas sin aplicar ningún fix al código fuente — 12 vulnerabilidades/bugs activos en producción, incluyendo 2 críticos en sockets (espionaje GPS, inyección de chat) y el flujo de pago Flow completamente roto por columna `metadata` ausente (ningún negocio podría pagar en producción real). El agente Mejoras documentó correctamente un nuevo hallazgo esta semana (cobro antes de INSERT en BD), pero sin aplicarlo. Se necesita intervención directa de Matías para desbloquear este patrón.
