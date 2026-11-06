# Informe Ejecutivo RepartoJusto
**Semana del:** 3 al 7 de noviembre de 2026

## Estado General: ⚠️ Operativo con alertas pendientes
La plataforma funciona y el código fue reforzado en seguridad, pero hay mejoras de rendimiento y una alerta de ventas que requieren acción de Matías esta semana.

---

## Lo que pasó esta semana

1. **Auditoría de seguridad completada (miércoles 4/11):** Se revisó todo el código del backend y se encontraron 4 vulnerabilidades reales, todas ya corregidas. La más grave era que las credenciales de tarjeta de los negocios podían filtrarse en las respuestas del servidor. Está solucionado.

2. **Pipeline de ventas creció a 256 prospectos:** Se redactaron 6 mensajes esta semana — 4 seguimientos a negocios ya contactados y 2 presentaciones nuevas (Pizzería La Torre y Da Salvatore, ambos en Villa Alemana). Están listos para que Matías los envíe.

3. **Rappi Turbo llegó a Quilpué (5 km de Villa Alemana):** Confirmado esta semana. Villa Alemana aún no tiene Turbo, pero la presión es real y creciente. La ventana para posicionarnos antes de que lleguen se acorta.

4. **PedidosYa sigue en incertidumbre:** 112 días sin comunicar condiciones 2027 a sus afiliados (venta a SSW Partners en curso). Los 9 prospectos del pipeline que están en PedidosYa están en su momento de mayor receptividad del año — argumento activo ahora.

5. **5 mejoras de rendimiento y seguridad en código identificadas:** Incluyen reducir escrituras a la base de datos durante el seguimiento GPS (de 300 a 30 por minuto con 10 riders), y corregir una condición que podría cobrar sin crear el pedido si la DB falla en ese instante.

---

## Problemas conocidos y su estado

| Problema | Estado |
|---|---|
| Service Worker en app rider (cacheo agresivo) | ✅ Resuelto — SW v6 excluye rider.html |
| Notificaciones push en Xiaomi | ⚠️ Pendiente — requiere acción manual del rider en Ajustes Android |
| Sonido en Chrome móvil | ✅ Resuelto — toggle Online activa audio y push juntos |
| Fechas Railway UTC vs. Chile UTC-3/4 | ✅ Resuelto — filtros usan AT TIME ZONE Santiago |

---

## Alertas

- **⚠️ Endpoint VAPID sin autenticación:** El endpoint que entrega la clave de notificaciones push es accesible sin login. Bajo riesgo inmediato, pero recomendado protegerlo. No fue aplicado aún.
- **⚠️ 5 mejoras de código pendientes de implementar:** Identificadas la semana del 2/11 — incluyen throttle GPS, validación de seguimiento de pedidos ajenos, y límite de tamaño en mensajes de chat. Ninguna está aplicada todavía.
- **⚠️ Servidor de producción no verificable desde el entorno de agentes:** El monitor lleva toda la semana sin poder conectarse a Railway por restricción de red del entorno. Verificar manualmente en https://repartojusto-production.up.railway.app/health.
- **🔴 178 días sin confirmar borradores de ventas:** Los mensajes se redactan pero Matías no los está enviando. Los contactos #22 Sushi Point (tel. 32-324-0504) y #15 Melt Pizzas llevan 104 días con borradores activos sin respuesta.

---

## Decisiones tomadas

- Agente de Seguridad aplicó 4 fixes directamente al código (negocios.js, riders.js, pagos.js) y los pusheó a producción el 4/11.
- Agente de Ventas incorporó el argumento SSW/incertidumbre 2027 en todos los borradores de negocios con PedidosYa.
- Agente Investigador confirmó competidor Flama Hub (startup chilena, delivery sin comisión con apoyo CORFO) — valida el modelo de negocio de RepartoJusto pero es competencia potencial a monitorear.

---

## Prioridades próxima semana

1. **Matías: enviar los 6 borradores de ventas** — especialmente los 4 seguimientos a contactados (#5 Sushi Zen, #7 Minimercado La Esquina, #1 Fuente de Soda El Rápido, #9 Rotisería El Gaucho). La ventana de argumento PedidosYa/SSW está en su punto máximo.
2. **Aplicar las 5 mejoras de código** — especialmente throttle GPS y validación de acceso a seguimiento de pedidos. El agente de mejoras puede ejecutarlas si Matías lo autoriza.
3. **Proteger endpoint VAPID** — fix simple de una línea, el agente de seguridad puede aplicarlo.
4. **Verificar estado del servidor manualmente** — el entorno de agentes no puede conectarse a Railway; revisar Railway dashboard para confirmar que producción está activa.
