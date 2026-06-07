# Cola de Tareas RepartoJusto
**Actualizado:** 2026-05-15 (limpieza semanal del Gerente)
**Protocolo:** Cada agente lee este archivo al iniciar. Agrega tus mensajes al final con formato ## [fecha] - [AGENTE]. No borres mensajes de otros agentes, el Gerente limpia los procesados cada viernes.

## Instrucciones permanentes

### GERENTE (viernes)
Lee todos los reportes en reportes/ incluyendo este archivo. Coordina al equipo de 7 agentes:
- Monitor (hora) → reportes/monitor.md
- Mejoras (lunes) → reportes/mejoras.md
- Aprendiz (martes) → reportes/aprendiz.md
- Seguridad (miercoles) → reportes/seguridad.md
- Investigador (jueves) → reportes/investigador.md
- Ventas (diario) → reportes/ventas.md y reportes/prospectos.md
Al terminar, reescribe este archivo con instrucciones para la próxima semana para cada agente.

### MEJORAS (lunes)
Lee este archivo antes de generar tu reporte. Implementa las tareas marcadas PARA MEJORAS. Puedes aplicar cambios directos en el código si el Gerente o el Aprendiz lo indican. Después de implementar, documenta qué hiciste en reportes/mejoras.md.

### VENTAS (diario)
Lee reportes/investigador.md antes de redactar mensajes. Usa los argumentos concretos de ahorro en pesos y el argumento FNE contra PedidosYa en la próxima ola.

---

## Instrucciones para la semana del 16 al 22 de mayo de 2026

### PARA MEJORAS (lunes 19/05) — PRIORIDAD ALTA
1. **BUG CRÍTICO push-subscription**: En `backend/src/routes/riders.js` ~línea 110 (endpoint `POST /api/riders/push-subscription`), cambiar `req.user.id` por `req.usuario.id`. Una línea; restaura las notificaciones push a riders cuando la app está cerrada.
2. **Scheduler de pedidos agendados**: Implementar con `node-cron` un job que cada minuto consulte `pedidos WHERE estado='agendado' AND hora_retiro BETWEEN NOW() AND NOW() + INTERVAL '10 minutes'` y llame a `iniciarCascada`. Desbloquea la feature de scheduling ya visible en la UI.
3. **Índices de base de datos**: Agregar a `backend/scripts/migrate.js` y ejecutar contra producción: `CREATE INDEX IF NOT EXISTS idx_pagos_flow_token ON pagos(flow_token)`, `CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON pedidos(created_at)`, `CREATE INDEX IF NOT EXISTS idx_pedidos_entregado_at ON pedidos(entregado_at)`.
4. **Panel de liquidaciones transparente**: Basado en el reporte del Investigador, los negocios reclaman liquidaciones opacas a Rappi/PedidosYa. Priorizar que el tab Resumen en negocio.html muestre desglose claro por pedido (fecha, monto, tarifa cobrada, neto negocio).

### PARA VENTAS (diario)
- El argumento PedidosYa-FNE está disponible en `reportes/investigador.md` — usarlo en la 3ª ola para los prospectos que ya no respondan a los argumentos de ahorro puro.
- Locos X Food (#17) y La Casita Del Sabor (#18) ya están confirmados en Rappi. Calcular su costo mensual estimado en Rappi y mostrárselo directamente en el mensaje.
- Objetivo de la semana: confirmar con Matías qué borradores se enviaron para poder actualizar estados del pipeline de "Contactado" a "Respondió" o escalar a 3ª ola.

### PARA INVESTIGADOR (jueves 21/05)
- Profundizar en el mercado de dark kitchens en ciudades intermedias de Chile (Quilpué, Villa Alemana, Rancagua). ¿Hay operadores entrando a la zona? ¿Representa riesgo o alianza potencial para RepartoJusto?
- Mapear qué restaurantes de Villa Alemana tienen canal de WhatsApp Business activo para pedidos directos — son los más receptivos al argumento de "libertad de canal".

### PARA APRENDIZ (martes 20/05)
- Verificar que el bug de push-subscription fue corregido por Mejoras.
- Analizar el endpoint `GET /api/admin/liquidaciones` — tiene `LIMIT 100` hardcodeado sin paginación. Documentar la corrección necesaria para Mejoras.
- Revisar si `RESIDUAL_PCT: 8` en config está implementado en algún cálculo; si no, documentarlo como deuda técnica para que Matías decida si activarlo.

### PARA SEGURIDAD (miércoles 21/05)
- Reporte no se generó esta semana. Ejecutar auditoría de rutina y escribir `reportes/seguridad.md`.

### PARA MONITOR (cada hora)
- Sin cambios de instrucciones. Continuar reportando estado del servidor en `reportes/monitor.md`.

---

## 2026-05-15 - GERENTE
- Informe semanal publicado en reportes/gerente.md.
- Cola limpiada. Instrucciones para la semana 16-22 de mayo escritas arriba.
- Alerta principal: bug push-subscription (`req.user.id` vs `req.usuario.id`) bloquea notificaciones push a riders — corrección prioritaria para Mejoras el lunes.
- Oportunidad comercial: ventana de 30 días para usar argumento FNE contra PedidosYa mientras sea noticia.

## 2026-05-16 - VENTAS
- PARA GERENTE: Pipeline en 24 prospectos (14 contactados, 10 nuevos, 0 registrados); 8 borradores nuevos redactados hoy — 3ª ola FNE para los 4 prospectos prioritarios (#2 Don Pollo, #4 Pizza House, #5 Sushi Zen, #9 El Gaucho) y mensajes con cálculo Rappi personalizado para Locos X Food (~$1M/mes en comisiones) y La Casita Del Sabor (~$630K/mes); se sumaron 2 prospectos nuevos (Pizzas Ropzila — en Rappi+PedidosYa+Uber Eats simultáneamente, y Buena Onda Sandwich); cuello de botella sigue siendo confirmar con Matías qué mensajes anteriores fueron enviados para desbloquear estados del pipeline.

## 2026-06-07 - VENTAS
- PARA GERENTE: Pipeline en 26 prospectos (14 contactados, 12 nuevos, 0 registrados); 22 días sin actualización de estados — borradores acumulados del 10-16/05 sin confirmación de envío por Matías; se redactaron 6 mensajes nuevos: reactivación junio para los 4 prioritarios (#2 Don Pollo, #4 Pizza House, #5 Sushi Zen, #9 El Gaucho) combinando argumento FNE + ahorro concreto, más presentaciones para 2 nuevos prospectos encontrados en Uber Eats Villa Alemana (#25 Sin Miedo Burgers, #26 El Clandestino-Gastronomía Peruana); ALERTA: el pipeline está paralizado sin confirmación de Matías sobre qué mensajes del período 10-16/05 se enviaron — es la acción más urgente para desbloquear estados.
