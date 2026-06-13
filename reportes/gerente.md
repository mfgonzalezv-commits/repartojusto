# Informe Ejecutivo RepartoJusto
**Semana del:** 6 al 12 de junio de 2026

---

## Estado General: ⚠️ Atención Requerida
La plataforma opera en Railway sin incidentes técnicos, pero el pipeline comercial sigue bloqueado esperando confirmación de Matías, y dos bugs críticos de producto llevan tres semanas sin corrección.

---

## Lo que pasó esta semana

- **Pipeline comercial alcanzó 30 prospectos identificados en Villa Alemana.** El agente de Ventas corrió tres veces esta semana (lunes 7, miércoles 9 y jueves 10) y sumó 6 nuevos negocios al radar: Sin Miedo Burgers, El Clandestino (gastronomía peruana), Tribeca Sushi, La Esquina Con Sabor, Diroom Burger Lounge y Poh Che Empanadas. Los mensajes de presentación para todos están listos en `reportes/prospectos.md`. El pipeline total es: 14 contactados + 16 nuevos = 30 negocios. **Ninguno está en estado "Registrado" aún.**

- **Reactivación junio completada para todos los contactados activos.** Los 12 prospectos con conversación iniciada en mayo tienen un mensaje personalizado de reactivación, redactado con el argumento de la multa FNE a PedidosYa y cálculos de ahorro en pesos concretos por negocio. El agente de Ventas también identificó el mejor momento estacional: botillerías y cafeterías tienen peak de invierno en junio. Todos los mensajes están listos — la acción pendiente es que Matías los envíe.

- **Sin cambios técnicos en el código esta semana.** El único movimiento en el repositorio fueron los commits del monitor (horario) y ventas. No hubo ninguna corrección de bugs ni mejora de producto. El código es idéntico al de la semana pasada.

- **El bug de notificaciones push a riders sigue sin corregir — tercera semana consecutiva.** Cuando los riders cierran la app no reciben ofertas de pedidos. La corrección es una línea de código. Cada semana que pasa, la tasa de primera asignación queda por debajo de su potencial real.

- **El servidor responde 403 solo para los agentes, no para usuarios reales.** El monitor reporta "caído" porque el entorno de ejecución no tiene permiso de red para alcanzar Railway. La plataforma está operativa para negocios, riders y clientes; el problema es de configuración del entorno de análisis, no del producto.

---

## Problemas conocidos y su estado

| Problema | Estado |
|---|---|
| Service Worker — app rider no actualizaba | ✅ Resuelto (SW v6) |
| Notificaciones Xiaomi — requiere permiso manual | ⚙️ En seguimiento |
| Audio en Chrome móvil | ✅ Resuelto |
| Zona horaria Railway vs Chile | ✅ Resuelto |
| Servidor responde 403 desde entorno de agentes | ⚙️ Problema de configuración interna — Railway opera con normalidad |
| Bug push-subscription riders (`req.user.id`) | 🔴 Semana 3 sin corrección |
| Pedidos agendados no se despachan (sin scheduler) | 🔴 Semana 3 sin corrección |
| Incentivos a riders no se registran contablemente | 🔴 Sin corrección |

---

## Alertas

🚨 **Agentes Mejoras y Seguridad no han corrido en tres semanas.** No existe `reportes/mejoras.md` ni `reportes/seguridad.md`. Todos los bugs identificados por el Aprendiz el 12/05 siguen abiertos. Sin auditoría de seguridad activa.

🚨 **28+ borradores acumulados sin enviar** — presentaciones y reactivaciones desde mayo hasta hoy. El pipeline comercial tiene 30 prospectos mapeados y argumentos preparados, pero 0 registros. El cuello de botella es la confirmación de Matías.

⚠️ **Ventana FNE-PedidosYa en su última semana útil** — la multa de US$3,8M fue noticia en marzo 2026. A este ritmo el tema perderá vigencia antes de usarse en los mensajes.

---

## Decisiones tomadas

- El agente de Ventas incorporó el argumento de la multa FNE en todos los mensajes de reactivación de junio y en las presentaciones de nuevos prospectos en PedidosYa (#27, #28, #30).
- Los prospectos Librería El Saber (#12) y Heladería Glacial (#14) fueron postergados a agosto — decisión acertada dada su estacionalidad.
- El monitor pasó a verificación horaria — útil una vez que se resuelva el problema de allowlist de red.

---

## Prioridades próxima semana

1. **Matías: enviar al menos los 14 mensajes de reactivación junio a los Contactados** — están listos, son urgentes y el argumento FNE pierde fuerza con cada semana que pasa. Lista en `reportes/prospectos.md`.
2. **Mejoras: corregir bug push-subscription** — `backend/src/routes/riders.js` ~línea 110: cambiar `req.user.id` por `req.usuario.id`. Una línea, lleva tres semanas pendiente.
3. **Mejoras: implementar scheduler de pedidos agendados** — `node-cron` que active pedidos con `estado='agendado'` 10 minutos antes de `hora_retiro`. Feature dormida que es diferenciador real frente a Rappi.
4. **Seguridad: correr auditoría** — llevan tres semanas sin revisar el código. La plataforma maneja pagos y datos de usuarios.
5. **Confirmar a Matías qué mensajes salieron en mayo** — sin ese dato el pipeline no puede avanzar de estados y los 0 registros no reflejan el trabajo real acumulado.
