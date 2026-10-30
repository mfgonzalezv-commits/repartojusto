# Informe Ejecutivo RepartoJusto
**Semana del:** 24 al 30 de octubre de 2026

---

## Estado General: ⚠️ Plataforma estable — producción no confirmable desde entorno de agentes

El servidor de producción no pudo verificarse directamente (restricción de red del entorno de ejecución, no necesariamente caída real). El código sigue madurando en seguridad; el cuello de botella de crecimiento sigue siendo la falta de respuesta de Matías sobre los mensajes enviados.

---

## Lo que pasó esta semana

1. **Se taparon tres fallas de seguridad reales.** El agente de seguridad corrigió el miércoles: (a) un negocio podía crear miles de pedidos por minuto sin límite — ahora hay un tope de 20 por hora; (b) si un negocio tenía la cuenta incompleta en la base de datos, el sistema se caía al ver un pedido propio — ahora responde correctamente; (c) lo mismo al cancelar un pedido. Las tres correcciones ya están en el código.

2. **El pipeline de ventas subió a 242 prospectos — pero sigue sin un solo cliente registrado.** El agente de ventas agregó 2 nuevos negocios (Fresh Bowls y Modo Pizza a la Leña, ambos en Uber Eats VA) y redactó 6 mensajes listos para enviar. El estado del pipeline: 228 nuevos, 14 contactados, **0 registrados**.

3. **El momento más potente de ventas del año está activo hoy y tiene fecha de vencimiento.** PedidosYa lleva **105 días sin comunicarles a sus restaurantes afiliados qué pagarán en 2027** (tras la compra por SSW Partners en julio). Hay 7 prospectos en el pipeline que están en PedidosYa ahora mismo. El argumento de cierre es concreto: *"Con nosotros son $500 fijos — PedidosYa no puede decirte lo mismo."* Esta ventana cierra cuando SSW finalmente anuncie condiciones.

4. **Noviembre = segundo peak más alto del año; empieza mañana.** El argumento "configúrate antes del rush de fin de año" es máximamente relevante esta semana. Hay 14 negocios contactados que podrían activarse si Matías confirma qué mensajes se enviaron.

5. **El agente investigador identificó la siguiente feature de mayor impacto comercial.** Más de 30 prospectos en el pipeline ya venden por canal propio (WhatsApp, Instagram, web) y no tienen logística de entrega. Flama Hub está haciendo exactamente eso en Chile con 90 clientes y ya se expande a México — valida que hay mercado. RepartoJusto tiene la pieza que les falta: el rider a tarifa fija.

---

## Problemas conocidos y su estado

| Problema | Estado |
|---|---|
| Service Worker cachea rider.html agresivamente | ✅ Resuelto (SW v6) |
| Notificaciones Xiaomi requieren permiso manual | ✅ Documentado — comunicado a riders |
| AudioContext Chrome móvil | ✅ Resuelto — toggle Online activa audio+push |
| Rate limit en creación de pedidos | ✅ Corregido esta semana |
| Errores de sistema al ver/cancelar pedidos con cuenta incompleta | ✅ Corregido esta semana |
| Cualquiera puede espiar ubicación GPS de riders ajenos (socket) | 🔴 Pendiente — **5ª semana** — código exacto listo, no aplicado |
| Pedido puede cobrarse sin guardarse en base de datos | 🔴 Pendiente — 4ª semana |
| Validación de formato en campo pedido_id de pagos | 🟡 Pendiente — bajo riesgo, requiere decisión |
| JWT con campo "nbf" genera error 500 en lugar de 401 | 🟡 Pendiente — es un cambio de una línea |

---

## Alertas

- 🔴 **PRIVACIDAD NO RESUELTA (5ª semana):** Cualquier usuario autenticado puede ver en tiempo real la ubicación GPS del rider de un pedido ajeno. El código de la corrección está listo en `reportes/mejoras.md`. No deben existir clientes reales antes de resolver esto.
- 🔴 **VENTAS BLOQUEADA — CUELLO DE BOTELLA CRÍTICO:** Sin saber qué mensajes se enviaron, el agente no puede distinguir prospectos activos de inactivos. El pipeline tiene 242 prospectos y **0 registrados**. Los borradores de esta semana son los más urgentes del año — la ventana PedidosYa/SSW y el peak de noviembre coinciden por primera vez.
- ⚠️ **OPORTUNIDAD DE ALIANZA SIN ACCIÓN:** Dark Kitchen SpA (WhatsApp +569 88993941, Roma 131 Viña del Mar) puede incorporar múltiples negocios de golpe sin prospectar uno a uno. Lleva semanas identificada sin ninguna acción reportada.

---

## Decisiones tomadas

- El agente de seguridad aplicó directamente 3 correcciones de alto riesgo sin esperar aprobación. Dos vulnerabilidades menores se dejaron pendientes para revisión de Matías (impactan la API pública o requieren un cambio mínimo).
- El agente de ventas actualizó los argumentos de todos los borradores activos con el eje SSW/certeza-2027 + noviembre como eje temporal.
- El agente investigador identificó "canal propio + rider" como la feature de mayor impacto comercial para los próximos 60 días.

---

## Prioridades próxima semana

1. **Matías: revisar y enviar los 6 borradores redactados esta semana.** Especialmente los 4 con eje PedidosYa/SSW. Esta ventana es la más valiosa del segundo semestre y tiene fecha de vencimiento incierta. Ver `reportes/ventas.md` para los textos listos.

2. **Corregir la vulnerabilidad de privacidad GPS** (`pedido:seguir` sin autorización). El código exacto está en `reportes/mejoras.md` ítem #2. Son ~12 líneas. No puede haber usuarios reales antes de esto.

3. **Contactar Dark Kitchen SpA** — WhatsApp +569 88993941. Una sola conversación puede traer 5-10 negocios. Es la oportunidad de menor esfuerzo / mayor retorno disponible hoy.
