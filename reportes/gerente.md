# Informe Ejecutivo RepartoJusto
**Semana del:** 13 al 19 de junio de 2026

---

## Estado General: ⚠️ Atención Requerida
La plataforma opera con normalidad y tuvo mejoras técnicas significativas esta semana, pero se detectaron dos vulnerabilidades críticas de seguridad que requieren corrección urgente, y el pipeline comercial sigue bloqueado esperando confirmación de Matías.

---

## Lo que pasó esta semana

- **Se reparó el sistema de alarmas para riders — problema de fondo resuelto.** El agente técnico realizó 6+ correcciones al sistema de notificación sonora: la alarma ahora suena de forma permanente hasta que el pedido sea tomado por algún rider (antes podía silenciarse sola), el polling bajó de 8 a 3 segundos para respuesta más rápida, y el Service Worker fue actualizado a v7 para despertar la app incluso cuando el rider tiene la pantalla apagada. Esto resuelve el problema de fondo por el que los riders no se enteraban de pedidos nuevos en tiempo real.

- **Se creó material impreso para prospectar negocios en la calle.** Se diseñó un brochure en formato 1/4 carta (tamaño manejable) con fondo navy y amarillo, que incluye QR de registro, resumen de la propuesta y contacto WhatsApp. Permite a Matías repartir material físico en Villa Alemana sin depender de mensajes digitales.

- **El agente de Mejoras corrió por primera vez e identificó 5 problemas en el código.** Dos son críticos de seguridad (ver Alertas). Los otros tres son mejoras de rendimiento, privacidad de datos de clientes y persistencia del chat entre rider y negocio.

- **Pipeline comercial sumó 2 nuevos prospectos, ahora en 38 negocios.** Se incorporaron Star Food Burger (Maturana 312) y Mako Sushi Delivery (El Ciruelillo 1384), ambos activos en Uber Eats y Rappi simultáneamente — los mensajes de presentación están redactados. El total es 38 negocios mapeados: 14 contactados, 24 nuevos, 0 registrados.

- **El mes de junio cierra la semana que viene — ventana comercial urgente.** Los 4 negocios prioritarios (Don Pollo, Pizza House, Sushi Zen, El Gaucho) tienen mensajes de cierre de junio redactados y listos. Son los que llevan más tiempo en el pipeline (42 días). Si se envían esta semana, llegan en el último tramo del mes cuando el argumento de "cerrar junio" todavía tiene fuerza.

---

## Problemas conocidos y su estado

| Problema | Estado |
|---|---|
| Service Worker — app rider no actualizaba | ✅ Resuelto (SW v7 esta semana) |
| Alarma de pedido nuevo en riders | ✅ Resuelto esta semana (6 fixes, polling 3s, alarma permanente) |
| Notificaciones Xiaomi — requiere permiso manual | ⚙️ En seguimiento — no tiene solución técnica |
| Audio en Chrome móvil | ✅ Resuelto |
| Zona horaria Railway vs Chile | ✅ Resuelto |
| Servidor responde 403 desde entorno de agentes | ⚙️ Problema de configuración interna — Railway opera con normalidad |
| Pedidos agendados no se despachan (sin scheduler) | 🔴 Pendiente |
| Chat entre rider y negocio se pierde al reiniciar servidor | 🔴 Pendiente |

---

## Alertas

🚨 **Vulnerabilidad crítica #1 — Webhook de pagos sin protección.** El webhook que Flow usa para confirmar pagos no verifica que el mensaje venga realmente de Flow. Cualquier persona con la URL puede enviar un POST falso y marcar un pago como completado sin haber pagado. Requiere corrección esta semana.

🚨 **Vulnerabilidad crítica #2 — Login sin límite de intentos.** El formulario de acceso para negocios, riders y admin no tiene restricción de intentos fallidos. Un atacante puede probar miles de contraseñas de forma automatizada. Requiere corrección esta semana.

⚠️ **42 días sin confirmación de Matías** sobre qué mensajes se enviaron en mayo. El pipeline tiene 38 negocios mapeados y 0 registrados. El cuello de botella es exclusivamente la confirmación de Matías — no hay nada más que los agentes puedan hacer hasta recibir esa respuesta.

⚠️ **Junio cierra en 12 días** — el argumento estacional (invierno + frío) y los mensajes de cierre de mes tienen fecha de vencimiento real.

---

## Decisiones tomadas

- El sistema de alarma del rider fue refactorizado completo: alarma permanente, polling 3s, SW v7 con despertar desde segundo plano.
- Se creó brochure físico en formato 1/4 carta para distribución presencial en Villa Alemana.
- Los prospectos Librería El Saber (#12) y Heladería Glacial (#14) se mantienen diferidos hasta agosto.
- El agente de Mejoras retomó actividad — sus 5 recomendaciones están documentadas en `reportes/mejoras.md` con el código exacto listo para aplicar.

---

## Prioridades próxima semana

1. **Matías: enviar mensajes de cierre de junio esta semana** — al menos los 4 prioritarios (#2 Don Pollo, #4 Pizza House, #5 Sushi Zen, #9 El Gaucho). Están listos en `reportes/prospectos.md`. Es urgente antes de que cierre el mes.
2. **Mejoras: corregir webhook de Flow** — agregar verificación HMAC. Código exacto en `reportes/mejoras.md`, mejora #1. Es la corrección más urgente de seguridad.
3. **Mejoras: agregar rate limiting al login** — 10 intentos por 15 minutos. Código exacto en `reportes/mejoras.md`, mejora #2. Requiere instalar `express-rate-limit`.
4. **Mejoras: implementar scheduler de pedidos agendados** — feature diferenciadora frente a Rappi que lleva meses inactiva.
5. **Matías: confirmar qué mensajes se enviaron en mayo** — cualquier respuesta (aunque sea "no envié ninguno") desbloquea la actualización de estados de los 14 Contactados.
