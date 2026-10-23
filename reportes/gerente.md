# Informe Ejecutivo RepartoJusto
**Semana del:** 20 al 23 de octubre de 2026

---

## Estado General: ⚠️ Plataforma operativa — producción no confirmable desde agentes

El servidor de producción no pudo verificarse directamente (restricción de red del entorno de agentes, no necesariamente caída). El código sigue mejorando; el cuello de botella de crecimiento sigue siendo la falta de feedback de Matías sobre los mensajes enviados.

---

## Lo que pasó esta semana

1. **Se taparon tres huecos de seguridad reales.** El martes el agente de seguridad corrigió una falla donde alguien podía marcar un pago como completado sin haber pagado, un ataque de tiempo que permitía adivinar qué emails están registrados, y una brecha donde un administrador comprometido podía transferir montos ilimitados a riders. Las tres correcciones ya están en el código.

2. **Pipeline de ventas subió a 228 prospectos — sin avanzar un estado.** Se sumaron dos nuevos negocios de canal propio (Arepas Don Tito y Kuchen y Strudel). El agente redactó 6 mensajes listos para enviar. Sin embargo, sin confirmación de Matías sobre qué se envió, el pipeline lleva **167 días sin actualizar estados** — no sabemos cuántos de los 228 están activos.

3. **La ventana de noviembre se abre en 10 días.** El investigador confirma que noviembre-diciembre es la segunda ventana de conversión más larga del año (60+ días). Los negocios entran en peak de fin de año: pastelerías, pollerías, pizzerías. El argumento urgente: "configúrate antes del rush, no durante."

4. **PedidosYa sigue sin hablarle a sus afiliados (98 días).** SSW Partners compró PedidosYa Chile en julio y no ha comunicado condiciones 2027 a ningún restaurante. Es el argumento de cierre más potente disponible: "nosotros te garantizamos $500 fijo por pedido en 2027 — PedidosYa no puede decirte lo mismo."

5. **Rappi Turbo todavía no llega a Villa Alemana.** Quilpué ya lo tiene. La ventana local de RepartoJusto sigue abierta pero el riesgo de entrada es inminente (6-12 meses según planes publicados). Demostración de cierre disponible: la URL de Rappi clasifica negocios de VA bajo "Quilpué" — invisible para búsquedas locales.

---

## Problemas conocidos y su estado

| Problema | Estado |
|---|---|
| Service Worker cachea rider.html agresivamente | ✅ Resuelto (SW v6) |
| Notificaciones Xiaomi requieren permiso manual | ✅ Documentado — comunicado a riders |
| AudioContext Chrome móvil | ✅ Resuelto — toggle Online activa audio+push |
| Webhook pagos aceptaba solicitudes sin firma | ✅ Corregido esta semana |
| Login con timing attack (enumeración de emails) | ✅ Corregido esta semana |
| Cualquiera puede espiar GPS de pedidos ajenos (socket) | 🔴 Pendiente — 4ª semana — FIX documentado, no aplicado |
| Pedido puede cobrarse sin guardarse en BD (bug financiero) | 🔴 Pendiente — 3ª semana |
| GPS del rider escribe en BD en cada ping | 🟡 Pendiente — FIX documentado, no aplicado |
| Contraseña mínima de 6 caracteres (débil) | 🟠 Pendiente — requiere decisión |
| 167 días sin confirmación de Matías sobre mensajes enviados | 🔴 CUELLO DE BOTELLA CRÍTICO |

---

## Alertas

- 🔴 **PRIVACIDAD NO RESUELTA:** Cualquier usuario autenticado puede ver en tiempo real la ubicación GPS de riders en pedidos que no son suyos. Esto debe corregirse antes de tener usuarios reales. El código exacto está documentado (`reportes/mejoras.md` ítem #1).
- 🔴 **VENTAS BLOQUEADA:** Sin saber qué mensajes se enviaron (167 días), el agente de ventas no puede distinguir prospectos activos de inactivos. Hay 228 prospectos, 14 contactados, y **0 registrados**. La plataforma puede estar perfecta técnicamente y no crecer.
- ⚠️ **VENTANA LIMITADA — PEDIDOSYA:** Los 7 prospectos PedidosYa del pipeline (#27, #28, #30, #33, #60, #90, #102) están en su momento de mayor receptividad. Cuando SSW finalmente anuncie condiciones 2027, el argumento de incertidumbre se cierra.
- ⚠️ **ALIANZA SIN ACCIÓN:** Dark Kitchen SpA (WhatsApp +569 88993941, Roma 131 Viña del Mar) puede traer múltiples negocios de golpe sin prospectar uno a uno. No hay reportes de acción ni de competencia en esa alianza.

---

## Decisiones tomadas

- El agente de seguridad aplicó directamente 3 correcciones críticas (webhook, login, incentivos) sin esperar aprobación; 2 pendientes requieren decisión de negocio (contraseña mínima) o impactan arquitectura (socket GPS).
- El agente de ventas redactó 6 borradores con eje "Noviembre en 10 días / SSW 98 días en silencio" — listos para que Matías los revise y envíe.
- El agente investigador marcó noviembre-diciembre como eje central para los próximos 60 días.

---

## Prioridades próxima semana

1. **Matías debe revisar y enviar los 6 borradores de esta semana.** Son los más calientes del pipeline. El silencio de SSW no dura para siempre — cuando anuncien condiciones 2027, la ventana de cierre se cierra.

2. **Corregir la vulnerabilidad de privacidad GPS** (`pedido:seguir` en sockets). El código exacto está en `reportes/mejoras.md` ítem #1. Son 15 líneas. No debe haber usuarios reales antes de esto.

3. **Contactar Dark Kitchen SpA** (WhatsApp +569 88993941). Una alianza con ellos puede traer 5-10 negocios sin prospectar uno a uno. Sigue sin competencia en esa oportunidad.
