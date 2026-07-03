# Informe Ejecutivo RepartoJusto
**Semana del:** 28 de junio – 3 de julio de 2026

---

## Estado General: ⚠️ ALERTA
El servidor de producción está devolviendo error 403 y no puede confirmarse que la plataforma esté operativa para negocios y riders. Requiere atención inmediata en Railway.

---

## Lo que pasó esta semana

1. **Se corrigieron 4 problemas de seguridad importantes en el código.** El más urgente: todos los riders llevaban semanas sin recibir notificaciones push de nuevos pedidos (un error de escritura en el código los silenciaba). También se cerró una brecha que permitía que alguien externo confirmara pagos falsos sin haber pagado, y se blindó el acceso al sistema para que no arranque si la contraseña interna no está configurada en Railway.

2. **El pipeline de ventas llegó a 66 prospectos, todos en Villa Alemana.** Esta semana se sumaron Nei Sushi Delivery y ConchetuBurger. Los mensajes de julio ya están redactados para los 4 contactados prioritarios y los nuevos de mayor ahorro estimado. Peak de invierno en curso — el mejor momento del año para cerrar.

3. **La noticia más importante del año para el negocio: Uber ofreció US$11.600 millones por la empresa dueña de PedidosYa.** Si se aprueba (12–18 meses), en Chile quedarían solo 2 actores dominantes: Uber/PedidosYa fusionados + Rappi. Esa concentración es la mayor ventana de oportunidad de mediano plazo para RepartoJusto: los negocios van a necesitar alternativas locales con condiciones estables y sin sorpresas.

4. **Rappi Turbo confirmado en Viña del Mar, Reñaca y Concón — sin expansión a Villa Alemana.** La ventana de posicionamiento local sigue abierta. El caso PedidosYa en tribunales (TDLC) sigue activo, manteniendo vivo el argumento de comisiones abusivas en la prensa todo el segundo semestre.

5. **Dark Kitchen Club no tiene expansión confirmada a Valparaíso.** La oportunidad de ser su socio logístico en la zona norte sigue disponible y sin competidores.

---

## Problemas conocidos y su estado

| Problema | Estado |
|---|---|
| Service Worker rider (cacheo agresivo) | ✅ Resuelto — SW v6 excluye rider.html |
| Notificaciones push en Xiaomi (requiere permiso manual) | ⚠️ Sin solución técnica — riders deben activarlo en Ajustes del teléfono |
| AudioContext en Chrome móvil | ✅ Resuelto — toggle Online activa audio y push simultáneamente |
| Filtros de fecha UTC vs. Chile | ✅ Resuelto — zona horaria Santiago aplicada en consultas |
| Riders sin push cuando app está cerrada (req.user.id typo) | ✅ Corregido esta semana por agente de seguridad |
| Webhook de pagos Flow sin verificación HMAC | ✅ Corregido esta semana — activo en producción |
| JWT_SECRET con valor público como fallback | ✅ Corregido — falla en producción si no está configurado |
| **Servidor de producción HTTP 403** | ❌ **Activo — posiblemente por JWT_SECRET no configurado en Railway** |
| CORS abierto a cualquier sitio web | ⚠️ Pendiente — requiere definir dominio de producción |
| `mostrar_costo_seguimiento` ignorado en seguimiento público | ⚠️ Pendiente — clientes ven el costo de envío aunque no deberían |

---

## Alertas

🔴 **CRÍTICO — Servidor de producción inaccesible (HTTP 403).** El agente de seguridad aplicó esta semana un cambio que hace que el servidor *no arranque* si `JWT_SECRET` no está configurado como variable de entorno en Railway. Es la causa más probable del 403. **Acción inmediata: entrar a Railway → Variables de entorno → agregar `JWT_SECRET` con un valor seguro de al menos 32 caracteres aleatorios. Sin esto, la plataforma no funciona.**

🟡 **Pipeline de ventas bloqueado hace 55 días.** Hay 66 borradores listos, pero Matías no ha confirmado cuáles fueron enviados. Sin esa confirmación, no se puede saber quién respondió ni escalar el tono. Julio es la semana de mayor impacto del año — cada día que pasa es oportunidad perdida.

🟡 **CORS sin restricción.** Cualquier sitio web puede hacer peticiones a la API. Requiere que Matías defina el dominio de producción definitivo para que el agente pueda cerrar esto.

---

## Decisiones tomadas

- **Agente de Seguridad** aplicó 4 correcciones directamente en el código el 1 de julio: notificaciones push reparadas, rate limiting en registros, validación HMAC en webhook de pagos, JWT seguro con fail-fast en producción.
- **Agente de Mejoras** propuso 5 mejoras adicionales (throttle GPS ×10, autorización de salas WebSocket, límite de mensajes de chat) — pendientes de implementación.
- **Agente Investigador** validó que el argumento Uber/PedidosYa es el de mayor potencia del año y debe incorporarse en todos los mensajes a prospectos en PedidosYa.

---

## Prioridades próxima semana

1. **Matías: verificar y restaurar el servidor en Railway** — agregar `JWT_SECRET` en variables de entorno y confirmar que el deploy entró correctamente. Sin esto, la plataforma está caída.
2. **Matías: enviar los borradores de julio urgentes** — al menos #22 Sushi Point Delivery (tel. (32) 324 0504) y #15 Melt Pizzas. Son los de mayor ROI estimado y el peak de invierno está en curso esta semana.
3. **Matías: contactar Dark Kitchen Club** — Instagram @darkitchenclub o darkitchenclub.cl. La ventana de alianza logística en Valparaíso sigue abierta y sin competidores.
4. **Aplicar mejoras técnicas pendientes** — throttle GPS (reduce carga en base de datos 10×), autorización de salas de tracking, límite de chat.
5. **Configurar `CORS_ORIGIN` en Railway** con el dominio de producción real una vez restaurado el servidor.

---

*Generado automáticamente por el Agente Gerente de RepartoJusto — viernes 3 de julio de 2026.*
