# Informe Ejecutivo RepartoJusto
**Semana del:** 25 al 31 de julio de 2026

---

## Estado General: ⚠️ Plataforma operativa — ventas sin cierre, vulnerabilidades parciales

La plataforma recibió 4 mejoras de seguridad reales esta semana (código aplicado y desplegado), pero dos vulnerabilidades críticas en tiempo real siguen abiertas, el pipeline de ventas llegó a 122 prospectos con cero registrados, y la ventana de oportunidad más valiosa del año está cerrando esta semana.

---

## Lo que pasó esta semana

- **Por primera vez, el Agente de Seguridad aplicó cambios reales al código.** Cuatro correcciones fueron confirmadas en el repositorio el 29 de julio: (1) las cuentas bloqueadas por el admin ahora quedan sin acceso de inmediato, sin esperar los 7 días que tardaba antes; (2) se puso límite a cuántas veces un rider puede actualizar su ubicación por minuto, evitando que un mal actor sature el servidor; (3) el costo de envío ahora se oculta correctamente a los clientes finales si el negocio así lo configura; (4) se corrigió un error silencioso en el cálculo de puntajes de riders.

- **El pipeline de ventas llegó a 122 prospectos, pero sigue sin ningún cliente registrado.** Se sumaron esta semana dos sandwicherías de Rappi (#121 Don Wuaton, #122 C Gourmet) y se redactaron mensajes con el argumento post-Premios Uber Eats (la ceremonia fue el 29 de julio — el contraste "Uber Eats premia a los grandes de Santiago / RepartoJusto trabaja en tu barrio" es poderoso esta semana). El cuello de botella sigue siendo la misma: Matías confirmando qué mensajes se enviaron.

- **La ventana de PedidosYa/SSW Partners está en su hora final.** Han pasado 14 días desde que la venta de PedidosYa Chile al fondo financiero de NY (SSW Partners) fue noticia. Los 7 borradores listos para negocios en PedidosYa (#27, #28, #30, #33, #60, #90, #102) deben salir esta semana — la noticia se enfría pronto y con ella el argumento más poderoso del año.

- **Rappi Turbo está en Quilpué, a 8 km de Villa Alemana, sin expansión confirmada todavía.** La ventana de captación de negocios locales antes de que Rappi llegue sigue abierta, pero se achica cada semana. El Investigador identificó una alianza de alto impacto: Dark Kitchen SpA (Viña del Mar), una cocina industrial donde operan 5–15 negocios delivery-first sin acuerdo logístico con nadie aún.

- **Oportunidad institucional gratuita:** El Municipio de Villa Alemana tiene un programa de emprendedores con 60+ participantes activos. Un correo o llamada a la unidad de emprendimiento municipal puede abrir una presentación grupal sin costo de prospección.

---

## Problemas conocidos y su estado

| Problema | Estado |
|---|---|
| Service Worker rider PWA cachea agresivamente | ✅ Resuelto — SW v6 |
| Notificaciones push en Xiaomi | ⚠️ Requiere acción manual del rider en ajustes del teléfono |
| AudioContext en Chrome móvil | ✅ Resuelto — toggle Online activa audio y push |
| Cuentas baneadas seguían operando 7 días | ✅ Resuelto esta semana — bloqueo inmediato |
| Rider podía saturar el servidor con actualizaciones de GPS | ✅ Resuelto esta semana — límite 60/min |
| Espionaje GPS entre usuarios autenticados | 🔴 Abierto — código del fix listo, sin aplicar |
| Cualquier usuario puede leer chat de pedidos ajenos | 🔴 Abierto — mismo estado |
| Audit trail de bonos a riders no grabado | 🔴 Abierto — INSERT silencioso, sin trazabilidad |
| Calificaciones de clientes sin verificación de identidad | ⚠️ Pendiente decisión de Matías |
| CORS_ORIGIN en Railway sin configurar | ⚠️ Pendiente — cualquier sitio web puede usar la API |

---

## Alertas

**🔴 Dos vulnerabilidades activas en producción:** Cualquier usuario con cuenta puede espiar el GPS en tiempo real y los mensajes del chat de pedidos que no le pertenecen. El código de la solución lleva semanas listo en `reportes/mejoras.md` — hay que copiarlo en `backend/src/sockets/index.js`. Debe resolverse antes de tener negocios reales pagando.

**🟡 Ventana SSW/PedidosYa en hora final:** El argumento "#X lleva 7 años pagando 29% + IVA a una empresa que hoy pertenece a un fondo de NY sin plan operativo" es el más potente del año. Los 7 borradores deben salir hoy o mañana.

**🟡 #22 Sushi Point y #15 Melt Pizzas — 35 días sin confirmación de envío.** Con borradores activos todos los días. Sin respuesta, el pipeline no avanza.

---

## Decisiones tomadas esta semana

- 4 fixes de seguridad aplicados y desplegados por el Agente de Seguridad (commit `ea9ef0b`, 29/07).
- 2 nuevos prospectos incorporados al pipeline (#121 Don Wuaton, #122 C Gourmet).
- Argumentos de venta actualizados con post-Premios Uber Eats (ceremonia 29/07) y ventana SSW final.

---

## Prioridades próxima semana

1. **Matías envía HOY los 7 mensajes PedidosYa/SSW** — #27 Tribeca Sushi, #28 La Esquina Con Sabor, #30 Poh Che, #33 Casa Festa, #60 Master Sándwich, #90 Buenaventura Pizzería, #102 La Joya. Es la última oportunidad de alto impacto con esa noticia.
2. **Aplicar los 2 fixes de WebSocket** — `pedido:seguir` y `chat:unirse` en `src/sockets/index.js`, código listo en `reportes/mejoras.md`. Prioridad antes de captar negocios.
3. **DM a @darkkitchenspa (Roma 131, Viña del Mar)** — alianza logística para toda la dark kitchen: acceso a 5–15 negocios delivery-first en una sola reunión. Sin competidor al 31/07.
4. **Matías contacta unidad de emprendimiento del Municipio de Villa Alemana** — presentación grupal gratuita a 60+ emprendedores activos.
5. **Matías configura CORS_ORIGIN en Railway** — 5 minutos en el dashboard, cierra acceso no autorizado a la API.
6. **Matías decide sobre calificaciones de clientes** — ¿se implementa token firmado en el link de seguimiento o se acepta el riesgo por ahora?

---

*Informe generado automáticamente — Agente Gerente RepartoJusto — 2026-07-31*
