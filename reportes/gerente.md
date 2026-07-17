# Informe Ejecutivo RepartoJusto
**Semana del:** 11 al 17 de julio de 2026

---

## Estado General: ⚠️ Atención requerida
La plataforma recibió mejoras de seguridad importantes y el contexto competitivo entrega el argumento de venta más potente del año, pero el pipeline lleva 70+ días sin confirmar envíos y hay vulnerabilidades técnicas abiertas que requieren acción.

---

## Lo que pasó esta semana

- **Se protegió la plataforma contra 3 nuevas vulnerabilidades.** El Agente de Seguridad aplicó: (1) límite al chat de soporte IA — sin él, cualquier negocio registrado podía generar costos ilimitados de API; (2) el rate limiter de login ahora sobrevive reinicios del servidor gracias a Redis — antes se podía saltear el bloqueo forzando un restart; (3) el endpoint de seguimiento público ahora tiene límite de peticiones por IP para evitar scraping masivo de direcciones.

- **Se corrigió un problema de despliegue en Railway.** Se agregó el archivo `nixpacks.toml` para que Railway apunte correctamente al directorio del servidor. Fix invisible pero crítico: sin él el servidor puede no iniciar tras un deploy.

- **PedidosYa Chile fue vendida a un fondo de inversión de Nueva York (16 de julio — hoy).** Uber compra Delivery Hero por US$14.000 millones; PedidosYa Chile no queda bajo Uber sino bajo SSW Partners, un fondo que ya planea revenderla. En 18 meses los negocios en PedidosYa no sabrán quién les cobra ni con qué condiciones. Es el argumento de venta más potente que RepartoJusto ha tenido. Es noticia fresca hoy.

- **Rappi Turbo confirmado en Quilpué — a 8 km de Villa Alemana.** Ya no es especulación: la dark store de entrega rápida está al lado. La ventana para posicionar riders y negocios locales antes de que Rappi cruce a Villa Alemana se acorta cada semana.

- **Pipeline de ventas creció a 94 prospectos.** Se agregaron 14 negocios nuevos con contactos de alta calidad (RetroSushi Delivery con 29K seguidores, Buenaventura en PedidosYa+Uber Eats). Los borradores de julio están redactados para todos los contactados activos, pero sigue sin confirmarse si algún mensaje fue enviado.

---

## Problemas conocidos y su estado

| Problema | Estado |
|---|---|
| Service Worker rider PWA cachea agresivamente | ✅ Resuelto — SW v6 excluye rider.html |
| Notificaciones push en Xiaomi | ⚠️ Pendiente — requiere acción manual del rider en ajustes del teléfono |
| AudioContext en Chrome móvil | ✅ Resuelto — toggle Online activa audio y push simultáneamente |
| Rate limiter login expiraba al reiniciar servidor | ✅ Corregido esta semana — ahora usa Redis con fallback a memoria |
| Espionaje de coordenadas GPS entre usuarios autenticados | 🔴 Abierto — código del fix listo, sin aplicar al repo |
| Inyección de mensajes en chats de pedidos ajenos | 🔴 Abierto — código del fix listo, sin aplicar al repo |
| Fuga de memoria en rate limiter de login (Map sin purge) | 🔴 Abierto — puede causar caída del servidor en tráfico real |
| 4 índices de base de datos faltantes | ⚠️ Pendiente — afecta rendimiento del scheduler de pedidos agendados |

---

## Alertas

**🔴 Pipeline de ventas paralizado 70+ días — acción urgente de Matías:** El equipo genera borradores cada día desde hace más de dos meses sin confirmación de que alguno fue enviado. Hay 94 prospectos con mensajes listos. Los prioritarios (#22 Sushi Point Delivery, tel. (32) 324 0504, y #15 Melt Pizzas) llevan 21 días consecutivos con borradores distintos. La noticia PedidosYa/SSW Partners de hoy y el peak de julio hacen esta semana la ventana más poderosa del año — en días pierde fuerza como argumento fresco.

**🔴 Dos vulnerabilidades de acceso cruzado abiertas en producción:** Cualquier usuario autenticado puede (1) unirse a la sala de un pedido ajeno y espiar las coordenadas GPS del rider en tiempo real, y (2) enviar mensajes al chat de pedidos que no le pertenecen. El código del fix está escrito y verificado en `reportes/mejoras.md` — solo falta copiarlo al archivo de código.

**🟡 Patrón crítico — el Agente de Mejoras documenta pero no aplica:** Lleva 4+ semanas generando correcciones con código correcto que no llega al repositorio. El commit del 13/07 solo tocó el reporte, no el código fuente. Requiere que Matías cambie el protocolo del agente o aplique los cambios directamente.

**🟡 Variable `RESIDUAL_PCT: 8%` sin implementar:** Existe en la configuración del sistema pero ningún cálculo de liquidaciones la usa. El frontend tampoco la lee — usa el valor hardcodeado directamente. Requiere decisión antes de activar negocios reales: ¿se cobra o se elimina?

---

## Decisiones tomadas esta semana

- 3 vulnerabilidades de seguridad corregidas y desplegadas por el Agente de Seguridad (rate limiting soporte, login Redis-backed, seguimiento público).
- Archivo `nixpacks.toml` agregado para estabilizar deploys en Railway.
- Argumentos de venta actualizados: PedidosYa → SSW Partners + Rappi Turbo en Quilpué incorporados por el Investigador.
- 14 nuevos prospectos agregados al pipeline esta semana (total: 94).

---

## Prioridades próxima semana

1. **Matías envía ESTA SEMANA los mensajes a #22 Sushi Point (tel. (32) 324 0504), #15 Melt Pizzas y los 6 prospectos en PedidosYa** — el argumento "SSW Partners" caduca como noticia fresca en pocos días.
2. **Matías contacta Dark Kitchen SpA esta semana** — DM a @darkkitchenspa en Instagram (Viña del Mar, Roma 131). Una alianza trae múltiples negocios sin prospectar uno a uno.
3. **Aplicar las 2 vulnerabilidades críticas de sockets** — código listo en `reportes/mejoras.md`. Copiar/pegar en `sockets/index.js`. Prioridad: `pedido:seguir` (espionaje GPS) y `chat:enviar` (inyección de mensajes).
4. **Confirmar en Railway que `REDIS_URL` está configurado** — activa el rate limiter de login Redis aplicado esta semana. Sin esta variable el fix corre en modo fallback (memoria, no persiste entre deploys).
5. **Matías decide sobre `RESIDUAL_PCT: 8%`** — definir si se activa en liquidaciones o se elimina de la configuración antes del lanzamiento con negocios reales.

---

*Informe generado automáticamente — Agente Gerente RepartoJusto — 2026-07-17*
