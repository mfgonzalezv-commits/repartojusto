# Informe Ejecutivo RepartoJusto
**Semana del:** 7 al 10 de julio de 2026

---

## Estado General: ⚠️ Atención requerida
La plataforma está operativa y recibió mejoras importantes de seguridad, pero hay un cuello de botella crítico en ventas y deuda técnica acumulada que necesita decisión de Matías.

---

## Lo que pasó esta semana

- **Se resolvió un bug que bloqueaba los correos.** El sistema de notificaciones por email usaba un paquete incompatible con el servidor (Railway corre Node 18, el paquete requería Node 20). Se reemplazó con una solución nativa. Los correos funcionan.

- **Se corrigieron 4 vulnerabilidades de seguridad.** El Agente de Seguridad detectó y corrigió: (1) cualquier persona podía calificar negativamente a un rider sin identificarse; (2) datos de rendimiento de riders eran públicos sin autenticación; (3) el webhook de pagos aceptaba notificaciones falsas en modo sandbox; (4) el servidor aceptaba peticiones de cualquier sitio externo. Todas corregidas.

- **El pipeline de prospectos llegó a 80 negocios.** Esta semana se agregaron Bravatta Italiana y Rincón Peruano. Julio es el mes de mayor demanda de delivery del año y los mensajes están redactados para aprovechar el peak invernal.

- **Se identificó una alianza estratégica prioritaria.** Dark Kitchen SpA opera en Viña del Mar (Roma 131, a 25 km de Villa Alemana) con restaurantes que pagan 30% de comisión a las apps grandes. Una alianza daría acceso inmediato a múltiples negocios sin prospectar uno a uno. Contacto recomendado: @darkkitchenspa en Instagram.

- **El contexto competitivo sigue siendo el más favorable del año.** PedidosYa sigue en juicio ante el TDLC, la compra por parte de Uber (US$11.600M) sigue sin aprobación regulatoria, y Rappi Turbo aún no llega a Villa Alemana.

---

## Problemas conocidos y su estado

| Problema | Estado |
|---|---|
| Service Worker rider PWA cachea agresivamente | ✅ Resuelto — SW v6 excluye rider.html del precache |
| Notificaciones push en Xiaomi | ⚠️ Pendiente — requiere acción manual del rider en ajustes del teléfono |
| AudioContext en Chrome móvil | ✅ Resuelto — toggle Online activa audio y push simultáneamente |
| Servidor Railway en UTC vs Chile UTC-3/4 | ✅ Mitigado — filtros usan zona horaria Santiago |
| Rate limiter en memoria (no resiste múltiples instancias) | ⚠️ Pendiente — se migra a Redis cuando se escale |

---

## Alertas

**🔴 Cuello de botella crítico en ventas — acción requerida de Matías esta semana:** El pipeline tiene 80 prospectos con mensajes listos, pero ningún negocio se ha registrado. El Agente de Ventas lleva **62 días** generando borradores sin confirmación de que Matías los está enviando. Los prospectos #22 Sushi Point Delivery (tel. (32) 324 0504) y #15 Melt Pizzas llevan 14 días consecutivos con borradores distintos sin envío confirmado. El peak de julio está en su punto máximo ahora — si los mensajes no salen esta semana, el argumento del frío invernal pierde fuerza.

**🟡 Mejoras técnicas documentadas pero sin aplicar al código:** El Agente de Mejoras lleva 4 semanas generando correcciones detalladas con código listo para copiar, pero los cambios no llegan al código fuente. Los problemas activos más urgentes son: fuga de memoria en el rate limiter de login (puede causar caída del servidor tras días de operación) y escritura a base de datos sin control en cada ping GPS del rider (puede saturar el servidor con 20+ riders activos).

**🟡 Variable de negocio sin definir:** En la configuración existe un "8% residual" definido pero que nunca se aplica en ningún cálculo de precios ni liquidaciones. Necesita resolución antes del lanzamiento en modo producción: ¿se cobra o se elimina?

---

## Decisiones tomadas esta semana

- Paquete de email `resend` reemplazado por solución nativa (compatible con Railway Node 18). Correos funcionando.
- 4 vulnerabilidades de seguridad corregidas y desplegadas en producción.
- CORS del servidor actualizado para usar variable de entorno (acción pendiente en Railway: configurar `CORS_ORIGIN=https://app.repartojusto.cl`).
- Pipeline de ventas ampliado a 80 prospectos con mensajes de peak invernal redactados.

---

## Prioridades próxima semana

1. **Matías envía los borradores de ventas urgentes** — al menos #22 Sushi Point Delivery y #15 Melt Pizzas. Sin negocios registrados no hay ingresos. Esta es la prioridad número uno.
2. **Matías contacta Dark Kitchen SpA esta semana** — DM a @darkkitchenspa en Instagram o vía darkkitchenspa.cl. Una alianza puede traer múltiples negocios de una sola conversación.
3. **Aplicar los 5 fixes técnicos documentados** — ya están escritos en `reportes/mejoras.md`, solo falta copiarlos al código. Prioridad: fuga de memoria en login y throttle de GPS del rider.
4. **Configurar en Railway:** `CORS_ORIGIN=https://app.repartojusto.cl` y `FLOW_SECRET=<secreto-flow>` para activar validación de pagos en todos los entornos.

---

*Informe generado automáticamente — Agente Gerente RepartoJusto — 2026-07-10*
