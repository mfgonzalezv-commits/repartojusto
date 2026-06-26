# Informe Ejecutivo RepartoJusto
**Semana del:** 20 al 26 de junio de 2026
**Generado:** viernes 27 de junio de 2026

---

## Estado General: ⚠️ Operativo con alertas

La plataforma sigue activa en producción (Railway). Esta semana se corrigieron 4 vulnerabilidades de seguridad graves. Sin embargo, hay un bug que lleva 6 semanas sin corregirse que deja a los riders sin alertas de nuevos pedidos.

---

## Lo que pasó esta semana

1. **Se blindó la plataforma contra 4 ataques críticos.** El agente de seguridad auditó el código el miércoles y aplicó correcciones directas: un rider ya no puede cancelar los pedidos de otros negocios, las calificaciones ahora requieren identidad verificada, los datos de clientes (teléfonos, direcciones) solo son visibles para quienes deben verlos, y el login ya tiene protección contra intentos masivos de contraseña.

2. **Un bug de notificaciones push a riders lleva 6 semanas sin corregirse.** Fue identificado el 19 de mayo, documentado dos veces más (Mejoras el 22/06, Aprendiz el 23/06), y sigue activo. El efecto práctico: cuando un rider cierra la app del celular, no recibe la alerta del nuevo pedido. La corrección es una sola línea de código en riders.js:183.

3. **El pipeline comercial llegó a 52 prospectos — ninguno registrado aún.** El agente de ventas generó borradores para todos los contactados y nuevos prioritarios, aprovechando el argumento de inicio de julio (peak de delivery en invierno). El pipeline crece, pero ningún negocio se ha registrado porque Matías no ha confirmado qué mensajes se enviaron en los últimos 48 días.

4. **La competencia acelera — Rappi invierte US$15 millones.** Anuncia 5 nuevas tiendas Turbo en Chile (ya activas en Viña del Mar, Reñaca y Concón). PedidosYa, en cambio, fue a juicio en el TDLC negándose a pagar su multa por controlar precios de restaurantes, lo que mantiene viva esa noticia como argumento de venta para RepartoJusto.

5. **El mercado valida el modelo.** Flama Hub, startup chilena de optimización de delivery, llegó a 140 restaurantes con apoyo de CORFO. Esto confirma que los negocios buscan activamente alternativas a Rappi y PedidosYa, y que hay disposición a pagar por esa alternativa.

---

## Problemas conocidos y su estado

| Problema | Estado |
|---|---|
| Service Worker rider (actualizaciones no llegaban) | ✅ Resuelto desde semanas anteriores |
| Alarma de pedido nuevo en riders | ✅ Resuelto — polling 3s, alarma permanente |
| Notificaciones push Xiaomi — permiso manual | ⚠️ Sin solución técnica posible — riders deben activarlo en Ajustes |
| AudioContext en Chrome móvil | ✅ Resuelto — toggle Online activa audio y push simultáneamente |
| **Riders sin push cuando la app está cerrada** | ❌ **Bug activo 6 semanas — riders.js:183, 1 línea sin corregir** |
| Webhook de Flow sin verificación de firma HMAC | ⚠️ Pendiente — requiere configurar FLOW_WEBHOOK_SECRET en Railway |
| JWT_SECRET con valor débil como fallback | ⚠️ Pendiente — riesgo en producción si variable no está configurada |
| Servidor inaccesible desde entorno de agentes | ⚙️ Problema del proxy de CI — Railway opera con normalidad |

---

## Alertas

🔴 **Bug push riders (6 semanas activo):** `req.user.id` debe ser `req.usuario.id` en `backend/src/routes/riders.js:183`. Cada semana que pasa, los riders operan sin alertas de pedidos cuando el celular está bloqueado. Es una sola línea — debe corregirse el lunes.

🟡 **Webhook de pagos sin firma:** En producción con Flow real, un atacante podría marcar pagos como completados sin haber pagado. Hoy estamos en sandbox, pero hay que configurar `FLOW_WEBHOOK_SECRET` en Railway antes de activar cobros reales. El agente de seguridad dejó el código listo.

🟡 **48 días sin confirmación de Matías** sobre qué mensajes de ventas se enviaron. El pipeline tiene 52 prospectos mapeados y 0 registrados. Sin esa confirmación, Ventas no puede actualizar estados ni escalar el tono de seguimiento.

🟡 **RESIDUAL_PCT: 8%** está definido en la configuración del sistema pero nunca se implementó en ningún cálculo. Matías debe decidir si activarlo o eliminarlo — es una deuda técnica que genera confusión.

---

## Decisiones tomadas

- Seguridad aplicó 4 correcciones directamente al código esta semana (cancelación de pedidos restringida por rol; calificaciones con autenticación obligatoria; protección por ownership en GET /pedidos/:id; rate limiting en login).
- La corrección del webhook de Flow fue documentada pero no aplicada, a la espera de que se configure la variable de entorno en Railway.
- Ventas completó la cobertura de "Arranque de Julio" para todos los contactados y nuevos prioritarios — los mensajes están listos para enviar.

---

## Prioridades próxima semana

1. **Mejoras: corregir bug push-subscription** — 1 línea en `backend/src/routes/riders.js:183`, cambiar `req.user.id` por `req.usuario.id`. Llevan 6 semanas los riders sin alertas cuando cierran la app.
2. **Matías: confirmar qué mensajes de ventas se enviaron** — cualquier respuesta desbloquea el pipeline completo de 52 prospectos. Si se pueden enviar los borradores de julio esta semana, el peak de invierno juega a favor.
3. **Matías: configurar FLOW_WEBHOOK_SECRET en Railway** — necesario antes de activar cobros reales con Flow. El código está listo.
4. **Mejoras: implementar scheduler de pedidos agendados** — feature diferenciadora que lleva meses inactiva en la UI pero sin lógica detrás.
5. **Matías: decidir sobre RESIDUAL_PCT: 8%** — activar o eliminar. Hoy no se cobra, hoy no se registra en ningún cálculo.
