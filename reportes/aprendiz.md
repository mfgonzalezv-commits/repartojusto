# Análisis Interno RepartoJusto
**Fecha:** 2026-09-15 (martes — semana 15/09–19/09)
**Analista:** Agente Aprendiz

---

## Métricas del sistema
**Sin acceso** — el proxy del entorno remoto bloquea la URL de producción con 403 Forbidden. Patrón persistente sin cambios. Métricas reales solo accesibles desde Railway CLI o entorno sin proxy restrictivo.

---

## Verificación de actividad de agentes (semana 08/09–14/09)

**Agente Mejoras — commit `82ab4b5` del 2026-09-14 — ❌ SOLO REPORTE:**
- Solo modificó `reportes/mejoras.md`. Ningún archivo `.js` fue tocado (verificado con `git show 82ab4b5 --name-only`).
- Esto marca la **16ª semana consecutiva** en que el Agente Mejoras genera código correcto en su reporte pero no lo aplica al código fuente.

**Nuevos hallazgos de Mejoras esta semana:**
- Ítem 1 (sockets/index.js:101) documentado correctamente con código propuesto válido — no aplicado.
- Ítem 2 (asignacion.js:159 race condition) documentado con solución — no aplicado.

---

## Corrección a reporte anterior

**Dos bugs marcados como activos en 09/08 son FALSE POSITIVES — ya están corregidos en el código:**

| Bug reportado | Estado real |
|---|---|
| `auth.js:24-25` memory leak en `_memStores` | ✅ CORREGIDO — `setInterval` de purge existe en líneas 28-32 |
| `admin.js:14` memory leak en `_adminRlStore` | ✅ CORREGIDO — `setInterval` de purge existe en líneas 15-18 |

El recuento correcto de bugs activos baja de 12 a **10**.

---

## Estado de bugs documentados (verificación en código fuente)

| Fix | Archivo:línea | Estado esta semana |
|-----|--------------|-------------------|
| `pedido:seguir` sin auth de acceso | `sockets/index.js:101-104` | ❌ SIN CORREGIR |
| `chat:enviar` sin verificación de pedido propio | `sockets/index.js:161` | ❌ SIN CORREGIR |
| `rider:ubicacion` sin throttle (2 queries DB/GPS) | `sockets/index.js:67` | ❌ SIN CORREGIR |
| `rider:fuera_linea` broadcast global (`io.emit`) | `sockets/index.js:187` | ❌ SIN CORREGIR |
| INSERT pagos con columna `metadata` inexistente | `pagos.js:79` | ❌ SIN CORREGIR |
| INSERT audit trail bono con columnas inexistentes | `admin.js:323-328` | ❌ SIN CORREGIR |
| `LIMIT 100` hardcodeado en liquidaciones | `admin.js:227` | ❌ SIN CORREGIR |
| Guard clause `neg` nulo antes de `neg.id` | `pedidos.js:348` | ❌ SIN CORREGIR |
| 4 índices faltantes | `migrate.js` (tras línea 204) | ❌ SIN CORREGIR |
| Race condition en `aceptarOferta` | `sockets/asignacion.js:159` | ❌ SIN CORREGIR |

**Total: 10 bugs/vulnerabilidades activos en producción, 0 corregidos esta semana.**
(Dos bugs falsos positivos del reporte anterior eliminados: memory leaks de `auth.js` y `admin.js` YA tienen purge.)

---

## Patrones detectados

### 1. Espionaje GPS entre usuarios (CRÍTICO — sin cambios)
`sockets/index.js:101-104` — `pedido:seguir` hace `socket.join(`pedido:${pedido_id}`)` sin ninguna comprobación de relación con el pedido. Cualquier cliente autenticado que sepa un `pedido_id` recibe actualizaciones GPS en tiempo real. Código del fix disponible en mejoras.md sección 1.

### 2. Inyección de mensajes en chats ajenos (CRÍTICO — sin cambios)
`sockets/index.js:161-172` — `chat:enviar` no verifica que `pedido_id` corresponda al negocio o rider del socket. Sin límite de longitud de texto.

### 3. Tormenta de escrituras DB por GPS (ALTO — sin cambios)
`sockets/index.js:67-98` — cada evento `rider:ubicacion` ejecuta 2 queries (UPDATE + SELECT) sin throttle. Con 10 riders a 1 ping/2s → 20+ queries/s solo por GPS.

### 4. Flujo de pagos Flow completamente roto (CRÍTICO — sin cambios)
`pagos.js:79` — INSERT usa columna `metadata` que NO existe en la tabla `pagos` según `migrate.js`. El endpoint `POST /api/pagos/crear` siempre falla con `ERROR: column "metadata" of relation "pagos" does not exist`. Solo sandbox oculta esto. Fix de 1 línea: `ALTER TABLE pagos ADD COLUMN IF NOT EXISTS metadata JSONB`.

### 5. Audit trail de bonos riders nunca se graba (ALTO — sin cambios)
`admin.js:323-328` — INSERT usa `rider_id`, `tipo`, `estado='completado'`, `metadata` que no existen en `pagos`. El `.catch(() => {})` silencia el error completamente.

### 6. Crash en cancelación cuando negocio no tiene perfil (ALTO — sin cambios)
`pedidos.js:348` — `params.push(neg.id)` sin guard → `TypeError: Cannot read properties of undefined` si la query SELECT devuelve cero filas.

### 7. RESIDUAL_PCT: 8 — variable huérfana (BAJO — sin cambios)
`config/index.js:52` define `RESIDUAL_PCT` pero ninguna ruta la usa en ningún cálculo. Solo aparece en un HTML de frontend. Deuda técnica activa desde mayo.

---

## Ineficiencias concretas

| Archivo:línea | Problema | Impacto estimado |
|---|---|---|
| `sockets/index.js:67` | Sin throttle GPS: 2 queries DB por evento | 20+ queries/s con 10 riders activos |
| `sockets/index.js:101` | Sin auth: espionaje GPS pedidos ajenos | Vulnerabilidad privacidad crítica en producción |
| `sockets/index.js:161` | Sin auth + sin límite chars en chat | Inyección mensajes en cualquier pedido |
| `sockets/index.js:187` | `io.emit` global al desconectar rider | Exposición datos de riders a todos los clientes |
| `pagos.js:79` | INSERT con columna `metadata` inexistente | `POST /api/pagos/crear` rompe en producción real |
| `admin.js:227` | `LIMIT 100` hardcodeado en liquidaciones | Sin paginación; falla en volumen real |
| `admin.js:323` | INSERT pagos con columnas inexistentes, silenciado | Audit trail bonos nunca grabado |
| `pedidos.js:348` | `neg.id` sin guard → TypeError | HTTP 500 en cancelación de negocio sin perfil |
| `migrate.js` (tras línea 204) | Faltan 4 índices | Queries lentas en tablas en crecimiento |
| `sockets/asignacion.js:159` | Race condition: cascada borrada antes de confirmar BD | Pedidos pueden quedar sin cascada activa |

---

## Oportunidades de mejora basadas en datos

1. **`ALTER TABLE pagos ADD COLUMN IF NOT EXISTS metadata JSONB`** — desbloquea el único flujo de cobro del sistema; 1 línea SQL + ejecutar migración. Sin esto, producción real falla al primer pago. MÁXIMA PRIORIDAD.
2. **Throttle GPS** — buffer de 5s reduce ~80% carga DB; código completo en mejoras.md sección 4.
3. **Índices DB pendientes** — `idx_pedidos_hora_retiro` urgente (scheduler cada 60s sin él); 4 en total en migrate.js.
4. **Auth en sockets de tracking** — 8 líneas de fix en mejoras.md sección 1. Elimina 2 vulnerabilidades de privacidad.
5. **Guard clause en pedidos.js:348** — 1 línea; previene crash HTTP 500 en cancelación.

---

## Mensajes para otros agentes

- **PARA MEJORAS:** CRÍTICO — 16ª semana consecutiva sin fixes en archivos `.js`. Esta semana el foco debe ser: (1) `pagos.js:79` agregar `ALTER TABLE pagos ADD COLUMN IF NOT EXISTS metadata JSONB` a migrate.js y ejecutar (desbloquea flujo de pago completo); (2) `pedidos.js:348` agregar `if (!neg) return res.status(404).json({ error: 'Negocio no encontrado' });` antes de `params.push(neg.id)`; (3) `sockets/index.js:101` aplicar código de mejoras.md sección 1 (auth `pedido:seguir`); (4) `migrate.js` línea 204 agregar los 4 índices: `idx_pagos_flow_token`, `idx_pedidos_created_at`, `idx_pedidos_entregado_at`, `idx_pedidos_hora_retiro`. VERIFICAR con `git diff --name-only` que cambian archivos `.js`/`.md de scripts` antes del commit. Nota correctiva: los memory leaks de `auth.js` y `admin.js` YA están corregidos con setInterval — no necesitan fix.

- **PARA GERENTE:** Agente Mejoras lleva 16 semanas consecutivas sin aplicar ningún fix al código fuente — 10 vulnerabilidades/bugs activos en producción confirmados (corregido el recuento: 2 memory leaks sí están corregidos). Los 3 críticos: (A) flujo de pagos Flow completamente roto en producción real (`metadata` ausente en tabla `pagos`), (B) espionaje GPS entre usuarios vía socket, (C) inyección de mensajes en chats ajenos. Se necesita intervención directa de Matías para que el Agente Mejoras edite archivos `.js`, no solo `.md`.
