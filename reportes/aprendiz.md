# Análisis Interno RepartoJusto
**Fecha:** 2026-09-01 (martes — semana 01/09–05/09)
**Analista:** Agente Aprendiz

---

## Métricas del sistema
**Sin acceso** — el proxy del entorno remoto bloquea la URL de producción con 403 Forbidden. Patrón persistente desde el inicio. Métricas reales solo accesibles desde Railway CLI o entorno sin proxy restrictivo.

---

## Verificación de actividad de agentes (semana 25/08–31/08)

**Agente Seguridad — commit `647a397` del 2026-08-26 — ✅ APLICÓ FIXES REALES:**
- `pagos.js` — agregó middleware `auth` al `GET /confirmar` (evita consulta de pago sin autenticar)
- `pedidos.js` — agregó validación de `distancia_km` contra haversine con margen 30% (previene subdeclaración de distancia)

**Agente Mejoras — commit `ba4d128` del 2026-08-31 — ❌ SOLO REPORTE:**
- Solo modificó `reportes/mejoras.md`. Ningún archivo `.js` fue tocado.
- Esto marca la **14ª semana consecutiva** en que el Agente Mejoras genera código correcto en su reporte pero no lo aplica al código fuente.

---

## Estado actual de bugs y vulnerabilidades

| Fix | Archivo:línea | Estado |
|-----|--------------|--------|
| `pedido:seguir` sin auth de acceso | `sockets/index.js:101` | ❌ SIN CORREGIR |
| `chat:enviar` sin verificación de pedido propio | `sockets/index.js:161` | ❌ SIN CORREGIR |
| `rider:ubicacion` sin throttle (2 queries DB/evento GPS) | `sockets/index.js:67` | ❌ SIN CORREGIR |
| `rider:fuera_linea` broadcast global (`io.emit`) | `sockets/index.js:187` | ❌ SIN CORREGIR |
| `_adminRlStore` Map sin purge (memory leak) | `admin.js:14` | ❌ SIN CORREGIR |
| `LIMIT 100` hardcodeado en liquidaciones | `admin.js:227` | ❌ SIN CORREGIR |
| INSERT a `pagos` con columnas inexistentes (`rider_id, tipo, metadata`) | `admin.js:319` | ❌ SIN CORREGIR |
| Guard clause `neg` nulo antes de `neg.id` | `pedidos.js:333` | ❌ SIN CORREGIR |
| 4 índices faltantes en migrate.js | `migrate.js` (tras línea 204) | ❌ SIN CORREGIR |
| `_memStores` sin purge en fallback Redis caído | `auth.js:24` | ❌ SIN CORREGIR |
| INSERT a `pagos` con columna `metadata` inexistente (quiebra pagos) | `pagos.js:79` | ❌ SIN CORREGIR |
| Race condition en `aceptarOferta` (cascada borrada antes de confirmar en DB) | `sockets/asignacion.js:162` | ❌ SIN CORREGIR |

**Nuevos hallazgos esta semana:**

**CRÍTICO — `pagos.js:79` rompe creación de pagos en producción:**
```js
`INSERT INTO pagos (pedido_id, flow_order_id, flow_token, monto, estado, metadata)
 VALUES ($1, $2, $3, $4, 'pendiente', $5)`,
```
La tabla `pagos` definida en `migrate.js` NO tiene columna `metadata`. Este INSERT lanzaría `ERROR: column "metadata" of relation "pagos" does not exist` en producción. El endpoint `POST /api/pagos/crear` fallaría completamente. Solo se oculta porque el sistema opera en modo sandbox y el flujo de pago real nunca se ejecuta. También: `pagoExistente.metadata?.url` (línea 67) siempre devolvería `undefined` por la misma razón.

**Confirmado: `mostrar_costo_seguimiento` SÍ está implementado:**
- `server.js:144–145`, `negocios.js:78–100`, `pedidos.js:43,256,410` — implementado correctamente.

**Confirmado: push-subscription bug YA corregido:**
- `riders.js:200–201` usa `req.usuario.id` correctamente. El bug de `req.user.id` mencionado en reportes anteriores ya no existe en el código actual.

---

## Patrones detectados

### 1. Espionaje GPS entre usuarios (CRÍTICO — verificado en código)
`sockets/index.js:101–104` — `pedido:seguir` hace `socket.join(`pedido:${pedido_id}`)` sin ninguna comprobación de que el usuario tenga relación con ese pedido. Cualquier cliente autenticado que conozca un `pedido_id` recibe actualizaciones GPS del rider en tiempo real.

### 2. Inyección de mensajes en chats ajenos (CRÍTICO — verificado en código)
`sockets/index.js:161–172` — `chat:enviar` no verifica que `pedido_id` corresponda al negocio o rider del socket. Cualquier negocio puede inyectar mensajes en chats de pedidos ajenos. Sin límite de longitud de `texto`.

### 3. Tormenta de escrituras a DB por GPS (ALTO — verificado en código)
`sockets/index.js:67–98` — cada evento `rider:ubicacion` ejecuta `UPDATE riders` + SELECT de pedidos activos sin throttle. Con 10 riders enviando GPS cada 2s → 20+ queries/segundo solo por GPS.

### 4. Creación de pagos completamente rota (ALTO — verificado en código)
`pagos.js:79` — INSERT usa columna `metadata` que no existe en la tabla `pagos`. `POST /api/pagos/crear` fallaría con error DB en producción. Encubierto por el modo sandbox.

### 5. Audit trail de bonos a riders nunca se graba (ALTO — verificado en código)
`admin.js:319–325` — INSERT usa columnas `rider_id`, `tipo` y `metadata` inexistentes en `pagos`. El `.catch(() => {})` silencia el error. Bonos registrados en saldo pero sin trazabilidad contable.

### 6. Crash en cancelación cuando negocio no existe (ALTO — verificado en código)
`pedidos.js:333` — `params.push(neg.id)` lanza `TypeError: Cannot read properties of undefined` si `neg` es undefined → HTTP 500 sin control.

### 7. Memory leaks en rate limiters (MEDIO — verificado en código)
- `admin.js:14` — `_adminRlStore` Map crece sin purge por cada IP única.
- `auth.js:24` — `_memStores` Map (fallback Redis caído) no purga entradas expiradas.

### 8. RESIDUAL_PCT: 8 — variable huérfana (BAJO — verificado)
`config/index.js:52` define `RESIDUAL_PCT` pero ninguna ruta ni servicio backend la consume. Solo como literal en HTML frontend. Requiere decisión de Matías.

### 9. Race condition en aceptarOferta (MEDIO — verificado en mejoras.md)
`sockets/asignacion.js:162` — cascada borrada de memoria antes de confirmar en DB. Si el UPDATE falla, el pedido queda sin cascada y sin rider asignado.

---

## Ineficiencias concretas

| Archivo:línea | Problema | Impacto estimado |
|---|---|---|
| `sockets/index.js:67` | Sin throttle: 2 queries DB por GPS update | 20+ queries/s con 10 riders activos |
| `sockets/index.js:101` | Sin auth: espionaje GPS de pedidos ajenos | Vulnerabilidad privacidad en producción |
| `sockets/index.js:161` | Sin auth + sin límite chars en chat | Inyección mensajes + potencial DoS memoria |
| `sockets/index.js:187` | `io.emit` global al desconectar rider | Exposición datos operativos a todos los clientes |
| `pagos.js:79` | INSERT con columna `metadata` inexistente | `POST /api/pagos/crear` falla en producción real |
| `admin.js:227` | `LIMIT 100` hardcodeado en liquidaciones | Imposible paginar; lento en producción real |
| `admin.js:319` | INSERT pagos con columnas inexistentes, silenciado | Audit trail bonos riders nunca grabado |
| `admin.js:14` | `_adminRlStore` sin purge | Memory leak por IP única acumulada |
| `pedidos.js:333` | `neg.id` sin guard → TypeError si negocio no encontrado | 500 en cancelación con datos inconsistentes |
| `migrate.js` (tras línea 204) | Faltan 4 índices (`flow_token`, `created_at`, `entregado_at`, `hora_retiro`) | Queries lentas en tablas que crecen con uso |

---

## Oportunidades de mejora basadas en datos

1. **Añadir columna `metadata JSONB` a tabla `pagos` en migrate.js** — desbloquearia `POST /api/pagos/crear` en producción; fix de 1 línea en migrate.js + ejecutar migración.
2. **Throttle GPS en sockets** — buffer de 5s reduce ~80% carga DB sin impacto UX perceptible.
3. **Índices DB pendientes** — `idx_pedidos_hora_retiro` urgente (scheduler corre cada 60s sin él); `idx_pagos_flow_token` afecta webhook Flow.
4. **Auth en sockets de tracking** — 8 líneas disponibles en mejoras.md sección 1; bloquea espionaje GPS.
5. **Tabla `bonos_riders` separada** — la tabla `pagos` no puede soportar el modelo contable de bonos; nuevo CREATE TABLE más 1 línea en admin.js.

---

## Mensajes para otros agentes

- **PARA MEJORAS:** CRÍTICO (14ª semana consecutiva sin fixes en .js). Nuevo hallazgo esta semana: `pagos.js:79` INSERT usa columna `metadata` que NO existe en la tabla `pagos` (migrate.js) — `POST /api/pagos/crear` falla completamente en producción real. Fix: agregar `ALTER TABLE pagos ADD COLUMN IF NOT EXISTS metadata JSONB` en migrate.js y ejecutar. Luego aplicar en orden con `git diff --name-only` confirmando `.js` antes del commit: (1) `sockets/index.js:101` auth `pedido:seguir`; (2) `sockets/index.js:161` auth `chat:enviar` + límite 500 chars; (3) `sockets/index.js:67` throttle GPS buffer 5s; (4) `admin.js:319` reemplazar INSERT pagos roto por INSERT a tabla `bonos_riders`; (5) `pedidos.js:333` guard `if (!neg)`; (6) `admin.js:227` paginación con `page`/`limit`; (7) `migrate.js` agregar 4 índices pendientes.

- **PARA GERENTE:** Agente Mejoras lleva 14 semanas sin aplicar fixes al código fuente — 12 bugs/vulnerabilidades activos en producción. Novedad crítica: `POST /api/pagos/crear` está roto (columna `metadata` inexistente en tabla `pagos`) — esto significa que si un negocio intenta iniciar un pago real en producción, fallará con error de DB. Solo encubierto por el modo sandbox de Flow. Agente Seguridad sí aplicó 2 fixes reales el 26/08 (distancia haversine + auth en /confirmar). `RESIDUAL_PCT: 8` sigue sin implementación backend — requiere decisión de Matías.
