# Informe Ejecutivo RepartoJusto
**Semana del:** 18 al 21 de agosto de 2026

---

## Estado General: ❌ CRÍTICO — Servidor caído

El servidor de producción no responde desde el último chequeo del monitor (08:32 hrs hoy viernes). No es un error menor: el sistema está inaccesible para negocios, riders y clientes en este momento.

---

## Lo que pasó esta semana

1. **Se corrigieron 3 vulnerabilidades de seguridad.** El agente de seguridad encontró y reparó dos problemas de alto riesgo en el chat de soporte (uno permitía inflar costos de API, otro permitía manipular respuestas del asistente IA) y activó protecciones del navegador que estaban desactivadas. Esto fortaleció significativamente la plataforma.

2. **Quedan 2 vulnerabilidades de seguridad pendientes de decisión.** Las calificaciones de clientes no requieren autenticación (un competidor podría atacar la reputación de un rider con votos falsos), y el endpoint de salud expone que el servidor está en producción. Ambas requieren una decisión de producto antes de aplicar el fix.

3. **El agente de mejoras identificó 5 optimizaciones técnicas** pendientes de aplicar: seguridad en el chat en tiempo real, reducción de consumo de memoria, validación de notificaciones push y una mejora de rendimiento en base de datos. Ninguna fue aplicada aún — son propuestas pendientes.

4. **Pipeline comercial creció a 164 prospectos** (14 ya contactados), con 4 nuevos mensajes preparados esta semana para negocios de Villa Alemana y Quilpué. El agente de ventas tiene todo listo para enviarse.

5. **Venció la ventana de oportunidad SSW.** Hoy (20/08) era el último día de la ventana de 35 días desde que PedidosYa fue comprada por SSW Partners (Nueva York) — argumento de urgencia muy concreto para captar negocios que usan esa plataforma. Los 7 borradores dirigidos a esos negocios debían haberse enviado esta semana.

---

## Problemas conocidos y su estado

| Problema | Estado |
|---|---|
| Service Worker en PWA rider (caché agresivo) | ✅ Resuelto — SW v6 activo |
| Notificaciones en Xiaomi (requiere permiso manual) | ⚠️ Pendiente — solución es manual del usuario |
| Audio en Chrome móvil (requiere gesto del usuario) | ✅ Resuelto — toggle Online lo activa todo |
| Railway en UTC vs Chile UTC-3/4 | ✅ Manejado — filtros con zona horaria |
| **Servidor de producción caído** | ❌ NUEVO — sin respuesta hoy |

---

## Alertas

> ❌ **URGENTE: El servidor de producción está caído.** El monitor registró falla de conexión completa (HTTP 000) en la última verificación. Railway puede haberlo detenido por inactividad, presupuesto agotado o un error de despliegue. Revisar el panel de Railway ahora: https://railway.app/dashboard

> ⚠️ **106 días sin feedback de Matías sobre mensajes enviados.** El agente de ventas no puede actualizar el pipeline porque no sabe si Matías envió los mensajes que cada semana se prepararon. Hay 14 negocios en estado "Contactado" que podrían haber avanzado o caído. Esto bloquea toda la inteligencia comercial.

> ⚠️ **Ventana SSW expiró hoy.** Los 7 mensajes preparados para ex-usuarios de PedidosYa ya no tienen el argumento de urgencia original. Hay que decidir si enviarlos con otro ángulo o descartarlos.

---

## Decisiones tomadas

- **Agente de Seguridad (mié 19/08):** Aplicó los 3 fixes disponibles. Dejó 2 pendientes por requerir decisión de producto (calificaciones sin auth, exposición de entorno).
- **Agente de Mejoras (dom 17/08):** Documentó 5 mejoras sin aplicarlas — propuestas listas para revisión.
- **Agente de Ventas (jue 20/08):** Preparó borradores, mantuvo pipeline activo. No puede avanzar estados sin confirmación de Matías.

---

## Prioridades próxima semana

1. **Restaurar el servidor de producción** — verificar Railway, revisar logs de despliegue, asegurar que el auto-deploy desde GitHub está activo.
2. **Confirmar a ventas qué mensajes se enviaron** — 5 minutos de revisión de WhatsApp/Instagram desbloquea 106 días de pipeline estancado.
3. **Aplicar las 5 mejoras técnicas del agente de mejoras** — en especial la seguridad en chat en tiempo real y la memoria del sistema de riders.
4. **Decidir sobre calificaciones sin autenticación** — si se prefiere el token único por pedido o CAPTCHA para proteger la reputación de los riders.

---

*Generado por el Agente Gerente — viernes 21 de agosto de 2026.*
