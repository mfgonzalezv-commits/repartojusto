# Informe Ejecutivo RepartoJusto
**Semana del:** 29 de agosto al 4 de septiembre de 2026

---

## Estado General: ⚠️ ALERTA COMERCIAL — Plataforma operativa, oportunidad urgente

La plataforma funciona. El cuello de botella es comercial: 192 prospectos, 0 registrados, y Fiestas Patrias en **14 días**.

---

## Lo que pasó esta semana

- **Se cerró un hueco de fraude en las calificaciones (martes 2).** Cualquiera podía bombardear con calificaciones negativas a un rider usando solo el link de seguimiento público. Ahora solo quien accedió al pedido puede calificar. Riesgo eliminado.

- **Se reforzó el chat de soporte contra caídas del servidor (martes 2).** Un mensaje malformado podía tumbar el proceso de Node.js. Corregido con una validación de formato.

- **El agente de ventas preparó 6 mensajes listos para enviar (jueves 3).** Seguimientos para #12 Librería El Saber, #13 Ferretería Los Maestros, #27 Tribeca Sushi, #60 Master Sándwich, y presentaciones para dos empanaderías nuevas en Quilpué (#191 y #192). **Ninguno puede salir sin confirmación de Matías.**

- **Pipeline crece pero no avanza: 192 prospectos, 0 registrados.** La razón es documentada: el pipeline lleva más de 112 días sin que Matías confirme si los mensajes preparados se enviaron. Los agentes redactan, pero solo Matías puede presionar "enviar".

- **Rappi Turbo ya está en Quilpué (8 km) sin llegada confirmada a Villa Alemana.** La ventana de posicionamiento como operador local sigue abierta — pero se acorta.

---

## Problemas conocidos y su estado

| Problema | Estado |
|---|---|
| Service Worker rider PWA (cache agresivo) | ✅ Resuelto (SW v6) |
| Notificaciones Xiaomi (permiso manual) | ⚠️ No solucionable por código — documentado para riders |
| AudioContext Chrome móvil | ✅ Resuelto (toggle Online unificado) |
| Zona horaria UTC vs. Chile en Railway | ✅ Resuelto (AT TIME ZONE en queries) |
| Fraude en calificaciones de clientes | ✅ Resuelto esta semana (HMAC token) |
| DoS en chat de soporte (historial malformado) | ✅ Resuelto esta semana |
| Rate limiters en memoria crecen sin limpiar | ⚠️ Pendiente de aplicar |
| JWT_SECRET débil fuera de producción | ⚠️ Pendiente de aplicar |
| Verificación JWT manual en calificaciones (drift) | ⚠️ Pendiente — requiere refactor |
| Socket tracking sin control de acceso por rol | ⚠️ Pendiente — mejora identificada |
| Race condition en aceptación de ofertas | ⚠️ Pendiente — mejora identificada |
| Escritura GPS en BD por cada ping (10× exceso) | ⚠️ Pendiente — throttle diseñado, no aplicado |

---

## Alertas

**🟡 Servidor no verificable desde este entorno.** El proxy de red del agente bloquea el acceso a Railway. La semana pasada el servidor estaba caído; no se puede confirmar el estado actual. **Matías debe verificar el dashboard de Railway directamente.**

**🔴 FIESTAS PATRIAS EN 14 DÍAS — ventana crítica de ventas.** El 18 de septiembre es el peak de delivery más alto del año (empanadas, asados, bebidas). Hay 6 mensajes listos y 192 prospectos esperando. La decisión que bloquea todo es simple: confirmar qué mensajes se enviaron la semana pasada y aprobar los 6 nuevos.

**🟡 #22 Sushi Point Delivery y #15 Melt Pizzas llevan 70 días consecutivos con borradores activos** sin confirmación de envío. Son dos prospectos de alta prioridad que pueden haberse enfriado.

---

## Decisiones tomadas

- Agente de Seguridad corrigió directamente la vulnerabilidad de calificaciones fraudulentas y el crash en soporte (2 de septiembre).
- Agente de Ventas agregó 2 nuevas empanaderías de Quilpué al pipeline (#191 Empanadas Doña María, #192 Empanadas RoySar) — rubro con mayor demanda en Fiestas Patrias.
- Argumento FNE/TDLC sigue activo para prospectos PedidosYa: SSW lleva 7 semanas sin comunicar planes + $35M USD en multas expuestas.

---

## Prioridades próxima semana

1. **Verificar servidor en Railway (Matías)** — revisar el dashboard y confirmar que el deploy está activo.
2. **Enviar los 6 mensajes listos hoy mismo** — cada día que pasa antes del 18/09 reduce la ventana de Fiestas Patrias.
3. **Confirmar estado de #22 y #15** — 70 días sin respuesta puede significar que se enfriaron o que nunca recibieron el mensaje.
4. **Contactar @darkkitchenspa en Instagram** — alianza potencial en Viña del Mar que puede traer varios negocios de una vez.
5. **Aplicar las 5 mejoras técnicas pendientes** del agente de mejoras (throttle GPS, seguridad sockets, race condition en asignación).

---

*Generado por el Agente Gerente — viernes 4 de septiembre de 2026.*
