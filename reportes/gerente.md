# Informe Ejecutivo RepartoJusto
**Semana del:** 9 al 15 de mayo de 2026

---

## Estado General: ⚠️ Atención Requerida
La plataforma sigue respondiendo HTTP 403 desde acceso externo — el servidor está activo en Railway pero bloqueado para el equipo de agentes; el cuello de botella comercial esta semana es la confirmación de envíos de mensajes a prospectos por parte de Matías.

---

## Lo que pasó esta semana

- **Pipeline comercial creció a 22 prospectos en Villa Alemana.** El equipo de ventas identificó y redactó mensajes para 22 negocios locales. Cuatro de ellos (Pollería Don Pollo, Pizza House, Sushi Zen, Rotisería El Gaucho) ya recibieron una segunda ola de mensajes con argumentos de ahorro calculados en pesos concretos. El pipeline tiene 28 borradores listos — el avance depende de que Matías los envíe.

- **Inteligencia competitiva lista para usar.** El agente Investigador publicó su primer reporte completo: PedidosYa enfrenta dos multas millonarias de la FNE en Chile (una por colusión, otra por bloquear libertad de precios de restaurantes). Es el momento de usar ese argumento en mensajes de ventas mientras el tema esté en la prensa. Adicionalmente, Rappi agrupa Villa Alemana bajo "Quilpué" — señal de que no la considera un mercado prioritario. RepartoJusto puede posicionarse como la primera plataforma con identidad local en la zona.

- **Detectado un bug crítico que bloquea las notificaciones push a riders.** El agente Aprendiz encontró que las notificaciones push a los repartidores nunca llegan cuando la app está cerrada, debido a un error de una sola línea en el código (`req.user.id` en lugar de `req.usuario.id`). Esto puede estar reduciendo la tasa de primera asignación de pedidos — los riders solo reciben ofertas si tienen la app abierta en ese momento. Este fix es prioridad máxima para la semana que viene.

- **Pedidos agendados nunca se despachan.** La plataforma permite crear pedidos con hora de retiro programada, pero el mecanismo automático que los activa 10 minutos antes nunca fue implementado. Es un diferenciador competitivo real que está dormido en el código.

- **Dos agentes no corrieron esta semana.** El agente de Mejoras (lunes) y el agente de Seguridad (miércoles) no generaron reportes. No hay registro de correcciones aplicadas al código ni de auditoría de seguridad esta semana.

---

## Problemas conocidos y su estado

| Problema | Estado |
|---|---|
| Service Worker — app rider no actualizaba | ✅ Resuelto (SW v6) |
| Notificaciones Xiaomi — requiere permiso manual | ⚙️ En seguimiento |
| Audio en Chrome móvil | ✅ Resuelto |
| Zona horaria Railway vs Chile | ✅ Resuelto |
| Servidor responde 403 desde acceso externo | 🔴 Pendiente — sin cambios |
| Push notifications a riders no llegan (bug una línea) | 🔴 Nuevo — sin corregir |
| Pedidos agendados no se despachan (sin scheduler) | 🔴 Nuevo — sin corregir |

---

## Alertas

🚨 **Bug crítico en notificaciones push a riders** — `backend/src/routes/riders.js` ~línea 110. Cambiar `req.user.id` por `req.usuario.id`. Una línea de código; impacto directo en la tasa de asignación de pedidos.

🚨 **28 borradores de ventas sin enviar** — el pipeline comercial está paralizado esperando confirmación de Matías. Sin envíos, el trabajo de prospección no genera resultados.

⚠️ **Agentes Mejoras y Seguridad no corrieron** — `reportes/mejoras.md` y `reportes/seguridad.md` no existen. Sin mejoras implementadas ni auditoría de seguridad esta semana.

⚠️ **Ventana de oportunidad de 30 días** — La crisis legal de PedidosYa con la FNE (multas US$3,8M y US$74M) es noticia ahora. Usar ese argumento en la 3ª ola de mensajes antes de que pierda vigencia.

---

## Decisiones tomadas

- El agente Investigador completó por primera vez el mapeo de debilidades de Rappi y PedidosYa en la zona — argumento de ventas nuclear disponible para próximas oleadas.
- El agente Ventas escaló a segunda ola para los 4 prospectos con mayor potencial de ahorro mensual (cálculos en pesos concretos por negocio).
- El agente Aprendiz identificó 10 ineficiencias en el código; priorizó 4 correcciones de alta relación costo/impacto para el agente Mejoras.

---

## Prioridades próxima semana

1. **Matías: enviar los 28 borradores pendientes** — sin esto el pipeline no avanza. Los mensajes de primera presentación y seguimiento están listos en `reportes/prospectos.md`.
2. **Mejoras: corregir bug push-subscription** — `req.user.id` → `req.usuario.id` en `backend/src/routes/riders.js` ~línea 110. Una línea, impacto alto en asignación de pedidos.
3. **Mejoras: implementar scheduler de pedidos agendados** — `node-cron` que active pedidos con `estado='agendado'` 10 minutos antes de `hora_retiro`. Desbloquea un diferenciador competitivo real.
4. **Mejoras: agregar 3 índices a la base de datos** — `idx_pagos_flow_token`, `idx_pedidos_created_at`, `idx_pedidos_entregado_at`. Mejora el rendimiento de pagos y métricas admin.
5. **Ventas: preparar 3ª ola con argumento PedidosYa-FNE** — aprovechar la ventana de 30 días mientras la multa sea noticia. Argumento nuclear disponible en `reportes/investigador.md`.
