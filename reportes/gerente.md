# Informe Ejecutivo RepartoJusto
**Semana del:** 25 de abril de 2026

---

## Estado General: ⚠️ Atención Requerida
El servidor de producción responde con error 403 ("Host not in allowlist"). La plataforma está activa pero el acceso está bloqueado — requiere corrección urgente de configuración en Railway.

---

## Lo que pasó esta semana

- **Soporte IA integrado en la app.** Negocios y riders ahora tienen un chat de soporte directamente dentro de su panel. Esto reduce la necesidad de atención manual y mejora la experiencia del usuario sin costo operativo adicional.

- **Problema del Service Worker resuelto definitivamente.** Los riders dejaban de recibir actualizaciones de la app porque el teléfono guardaba una versión antigua. Se aplicó la corrección final (versión 6): a partir de ahora los cambios llegan solos al recargar.

- **Panel del negocio ampliado con datos.** Se agregaron dos nuevas secciones: *Resumen* (ventas del período) y *Clientes* (base de compradores). Los dueños de local ahora tienen visibilidad real de su rendimiento sin salir de la app.

- **Historial de riders mejorado.** Los repartidores ven sus entregas ordenadas por día con el total de ganancias diarias. Facilita su control de ingresos y reduce consultas de soporte.

- **Material de ventas listo.** Se creó un flyer tamaño 1/4 de carta para captación de nuevos negocios. Disponible para imprimir o enviar digitalmente.

---

## Problemas conocidos y su estado

| Problema | Estado |
|---|---|
| Service Worker — app rider no actualizaba | ✅ Resuelto (SW v6) |
| Notificaciones Xiaomi — requiere permiso manual | ⚙️ En seguimiento — wizard de instalación guía al rider paso a paso |
| Audio en Chrome móvil — no sonaba al llegar pedido | ✅ Resuelto — el toggle Online activa audio y notificaciones juntos |
| Zona horaria Railway vs Chile | ✅ Resuelto — filtros de fecha usan hora de Santiago |

---

## Alertas

🚨 **Producción con error 403.** El servidor responde "Host not in allowlist" desde al menos el 25/04. El agente Monitor lo marca como CAÍDO. Acción requerida: revisar variable de entorno `ALLOWED_HOSTS` o configuración de dominio en Railway. Esto afecta directamente a negocios y riders que intenten usar la plataforma.

⚠️ **Agentes de Seguridad y Mejoras aún no han corrido.** Solo existe el reporte del Monitor. Los informes de seguridad.md y mejoras.md estarán disponibles la próxima semana.

---

## Decisiones tomadas

- Se eliminó el botón de audio separado en la app rider. Ahora el toggle "Online" activa simultáneamente el sonido y las notificaciones push — flujo más simple para el rider.
- Se optó por integrar el soporte IA dentro de las apps existentes, sin redirigir a canales externos.

---

## Prioridades próxima semana

1. **Resolver el error 403 en producción** — bloquea el uso real de la plataforma. Prioridad máxima.
2. **Iniciar captación de negocios** — usar el flyer recién creado. Objetivo: al menos 3 locales nuevos registrados.
3. **Revisar reportes de Seguridad y Mejoras** cuando los agentes corran (miércoles y lunes respectivamente).
