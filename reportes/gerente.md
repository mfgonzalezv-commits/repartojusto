# Informe Ejecutivo RepartoJusto
**Semana del:** 18 al 24 de julio de 2026

---

## Estado General: ⚠️ Atención requerida
La plataforma recibió 4 mejoras de seguridad relevantes esta semana, pero persisten dos vulnerabilidades abiertas en producción y el pipeline de ventas lleva 28+ días sin confirmación de mensajes enviados por Matías.

---

## Lo que pasó esta semana

- **Se protegió la plataforma contra DoS y manipulación del chat de soporte IA.** El Agente de Seguridad aplicó dos fixes críticos: (1) los endpoints de listado ya no aceptan peticiones que pidan traer millones de registros de la base de datos (lo que podía tumbar el servidor); (2) el historial del chat con soporte IA ya no puede ser manipulado para hacer que la IA responda fuera de sus instrucciones ni generar costos de API exagerados.

- **Se identificó que los bonos a riders no dejan registro.** El Agente Aprendiz descubrió que cada vez que un admin otorga un bono o incentivo a un rider, el sistema intenta guardarlo en la base de datos con columnas que no existen — el error pasa silenciosamente y el registro nunca se graba. El saldo se acredita, pero no queda trazabilidad de quién aprobó qué bono ni por qué.

- **Se confirmó el patrón crítico del Agente de Mejoras.** El Aprendiz verificó en el historial de cambios que el Agente de Mejoras lleva 8+ semanas generando correcciones con código correcto que **nunca llega al repositorio**. Hay 7 fixes documentados — incluyendo dos vulnerabilidades de seguridad activas — que solo existen en papel.

- **Ventana PedidosYa/SSW Partners: 7 días abierta, urge actuar.** El Investigador confirmó que la venta de PedidosYa Chile a SSW Partners (fondo de NY) es la noticia más poderosa para venderle a negocios en esa plataforma. Hay 7 borradores listos. La ventana de impacto máximo es esta semana.

- **Pipeline de ventas en 108 prospectos, cero registrados.** El Agente de Ventas agregó 2 nuevos prospectos (amasandería y pastelería artesanal sin plataforma), redactó 4 mensajes nuevos, y tiene borradores urgentes para los 7 prospectos en PedidosYa. El cuello de botella sigue siendo Matías confirmando qué mensajes se enviaron.

---

## Problemas conocidos y su estado

| Problema | Estado |
|---|---|
| Service Worker rider PWA cachea agresivamente | ✅ Resuelto — SW v6 excluye rider.html |
| Notificaciones push en Xiaomi | ⚠️ Requiere acción manual del rider en ajustes del teléfono |
| AudioContext en Chrome móvil | ✅ Resuelto — toggle Online activa audio y push |
| Espionaje GPS entre usuarios autenticados | 🔴 Abierto — código del fix listo desde hace semanas, sin aplicar |
| Inyección de mensajes en chats ajenos | 🔴 Abierto — mismo problema, mismo estado |
| Audit trail de bonos riders no grabado | 🔴 Nuevo — INSERT silencioso, no hay registro de incentivos |
| Agente Mejoras no aplica cambios al código | 🔴 Patrón confirmado — 8+ semanas sin commits de código |
| Calificaciones clientes sin verificación de identidad | ⚠️ Pendiente decisión de producto |
| CORS_ORIGIN en Railway sin configurar | ⚠️ Pendiente — actualmente acepta peticiones de cualquier dominio |

---

## Alertas

**🔴 Dos vulnerabilidades de seguridad activas en producción:** Cualquier usuario con cuenta puede (1) espiar las coordenadas GPS de pedidos que no le pertenecen y (2) inyectar mensajes en chats de pedidos ajenos. El código de la solución existe desde hace semanas en `reportes/mejoras.md` — solo hay que copiarlo en `sockets/index.js`. Aplica antes de tener negocios reales.

**🔴 El Agente de Mejoras solo escribe documentos, no código:** El Aprendiz verificó git log: los últimos commits del agente solo tocaron el archivo de reporte, nunca los `.js`. El protocolo actual no funciona. Matías debe corregir esto.

**🟡 Ventana PedidosYa cierra esta semana:** Los 7 mensajes a prospectos en PedidosYa (negocios en la plataforma vendida a fondo de NY) deben salir antes del viernes 31/07 para aprovechar que la noticia es fresca.

**🟡 28+ días sin confirmación de mensajes enviados:** Los Agentes de Ventas generan borradores a diario pero Matías no confirma cuáles se enviaron. Sin esa confirmación no se puede avanzar el pipeline ni medir conversión real.

---

## Decisiones tomadas esta semana

- 4 fixes de seguridad aplicados y desplegados por el Agente de Seguridad: cap de paginación (100/200 registros máx) en endpoints de admin, negocios y riders; validación de historial de chat con IA.
- 2 nuevos prospectos agregados al pipeline (#107 Rincón de las Masas, #108 Amasandería PURÉN).
- Argumentos de venta actualizados con SSW Partners y Rappi Turbo Quilpué (máxima urgencia).

---

## Prioridades próxima semana

1. **Matías envía ESTA SEMANA los 7 mensajes a prospectos PedidosYa** — #27 Tribeca Sushi, #28 La Esquina Con Sabor, #30 Poh Che, #33 Casa Festa, #60 Master Sándwich, #90 Buenaventura Pizzería, #102 La Joya. Borradores listos. Ventana cierra pronto.
2. **Aplicar los 2 fixes de seguridad en sockets** — código listo en `reportes/mejoras.md`. Copiar en `sockets/index.js`: función `pedido:seguir` (línea ~101) y `chat:enviar` (línea ~161). Tarea para el Agente de Mejoras el lunes, con verificación del Aprendiz el martes.
3. **Corregir el audit trail de bonos a riders** — `admin.js:290`: cambiar el INSERT por una tabla de logs correcta o eliminar las columnas inexistentes para que el error sea visible.
4. **Matías configura CORS_ORIGIN en Railway** — evita que cualquier sitio web externo pueda consumir la API. Tomar 5 minutos en el dashboard de Railway.
5. **Matías decide sobre calificaciones de clientes sin verificación** — ¿se implementa token firmado en el link de seguimiento para evitar calificaciones falsas, o se acepta el riesgo por ahora?

---

*Informe generado automáticamente — Agente Gerente RepartoJusto — 2026-07-24*
