# Informe Ejecutivo RepartoJusto
**Semana del:** 15 al 18 de septiembre de 2026

---

## Estado General: ⚠️ Servidor no confirmado — mejoras de seguridad aplicadas

El agente de monitoreo no puede conectarse a producción desde el entorno de ejecución (política de red interna del agente, no necesariamente el servidor caído). Se recomienda verificar manualmente en Railway. Sin pedidos registrados esta semana.

---

## Lo que pasó esta semana

1. **Se reforzó la seguridad del sistema.** El agente de seguridad detectó y corrigió 7 vulnerabilidades reales: el sistema de límite de intentos ya funciona correctamente en Railway (antes todos los usuarios compartían el mismo límite), se pusieron topes a los campos de texto para evitar abuso de almacenamiento, y se limitó la frecuencia de llamadas a los reportes más pesados de la plataforma.

2. **Las Fiestas Patrias golpearon justo cuando los competidores son más caros.** El 18 de septiembre —hoy— es el día de mayor demanda de delivery del año: empanadas +229%, asados +51%, pedidos +30-35% vs. semana normal. Todos nuestros prospectos pagaron comisiones de 34-36% en su mejor día del año. Esto abre la mejor ventana de conversión del 2026 entre el 22 y 26 de septiembre.

3. **El pipeline de ventas llegó a 214 prospectos.** Se agregaron 2 nuevas parrilladas (#213 y #214) y se redactaron 10 mensajes listos para enviar, todos con argumento de Fiestas Patrias. El problema sigue siendo el mismo: **134 días sin confirmación de Matías sobre qué mensajes realmente se enviaron**. El pipeline no puede avanzar sin ese feedback.

4. **PedidosYa sigue en incertidumbre total.** SSW Partners (nuevo dueño) lleva 63 días sin comunicar a los restaurantes qué pasará con sus contratos en 2027. Combinado con las multas de US$35M y el juicio activo, es el argumento más fuerte del año para ofrecerles estabilidad.

5. **Rappi Turbo aún no llega a Villa Alemana.** La ventana de posicionamiento sigue abierta. Quilpué ya tiene Turbo; cuando llegue a VA, los riders migrarán. Hay que actuar antes.

---

## Problemas conocidos y su estado

| Problema | Estado |
|---|---|
| Service Worker cachea rider.html agresivamente | ✅ Resuelto (SW v6) |
| Notificaciones Xiaomi requieren permiso manual | ✅ Documentado — solución comunicada a riders |
| AudioContext Chrome móvil | ✅ Resuelto — toggle Online activa audio+push |
| Rate limiting inefectivo en Railway | ✅ Resuelto esta semana |
| Cualquiera puede espiar el GPS de un rider ajeno (socket) | 🔴 Pendiente — 3ª semana sin corregir |
| Pedido puede quedar huérfano si falla la asignación (bug de carrera) | 🔴 Pendiente — 3ª semana sin corregir |
| Cobro al negocio antes de confirmar pedido en BD | 🟠 Pendiente — 2ª semana sin corregir |
| GPS del rider escribe en BD en cada ping (alto consumo) | 🟡 Pendiente — 3ª semana sin corregir |
| Chat sin límite de tamaño (riesgo DoS) | 🟡 Pendiente — 3ª semana sin corregir |
| Webhook de pagos sin autenticación en sandbox | 🟡 Sin corregir — riesgo bajo en sandbox |

---

## Alertas

- 🔴 **CRÍTICO — Privacidad:** Cualquier usuario autenticado puede unirse a la sala de seguimiento de cualquier pedido y ver en tiempo real la ubicación GPS del rider y el estado del pedido. Esto es privacidad de clientes comprometida. Debe corregirse antes de tener usuarios reales.
- 🔴 **CRÍTICO — Integridad financiera:** El sistema puede cobrar al negocio y luego fallar al guardar el pedido en la base de datos. Si eso pasa, el dinero se descuenta sin que exista el pedido. Corrección documentada y lista para aplicar.
- ⚠️ **NEGOCIO — Cuello de botella de ventas:** 134 días sin que Matías confirme qué mensajes se enviaron. Sin ese feedback el agente de ventas no puede avanzar estados ni saber qué funciona.
- ⚠️ **OPORTUNIDAD LIMITADA EN EL TIEMPO:** La ventana post-Fiestas Patrias (22–26 septiembre) es el período de mayor receptividad del año. Los negocios acaban de pagar su peak con comisiones máximas. Hay 5 días hábiles para aprovecharla.

---

## Decisiones tomadas

- El agente de seguridad aplicó directamente los 7 fixes de menor riesgo sin esperar aprobación; los 3 restantes (webhook sandbox, prompt injection, privacidad socket) fueron documentados y recomendados pero no aplicados por requerir decisión de diseño o impactar arquitectura.
- El agente de ventas redactó 10 mensajes de seguimiento con argumento de Fiestas Patrias listos para revisión de Matías.
- El agente investigador identificó la semana 22–26/09 como ventana prioritaria de conversión y lo escaló a ventas.

---

## Prioridades próxima semana

1. **Activar campaña post-Fiestas Patrias (22–26/09).** Matías debe revisar y enviar los 10 borradores listos. Argumento central: "¿Cuánto te dejó el 18 después de comisiones? Con nosotros $500 fijo por pedido." Foco en empanaderías (#57, #58, #189–#198), pollerías y parrilladas. Esta ventana cierra el 26/09.

2. **Corregir la vulnerabilidad de privacidad GPS (socket `pedido:seguir`).** El código exacto está documentado en `reportes/mejoras.md` ítem #1. Es un cambio de 15 líneas. No debe haber usuarios reales antes de esto.

3. **Contactar @darkkitchenspa (WhatsApp +569 88993941, Roma 131 Viña del Mar).** Una alianza con cocinas industriales puede traer 5–10 negocios sin prospectar uno a uno. La ventana está abierta y sin competidores en VA/Quilpué.
