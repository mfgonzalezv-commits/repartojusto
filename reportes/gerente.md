# Informe Ejecutivo RepartoJusto
**Semana del:** 1 al 7 de agosto de 2026

---

## Estado General: ⚠️ Plataforma más segura — servidor sin confirmar, ventas en movimiento

La semana tuvo avances reales en seguridad (5 correcciones aplicadas al código el 05/08), el pipeline de ventas creció a 136 prospectos, y el mercado sigue presionando a favor de RepartoJusto. Pero el servidor en Railway no respondió al health check de ningún agente esta semana — se desconoce si la plataforma está en línea hoy.

---

## Lo que pasó esta semana

- **5 correcciones de seguridad aplicadas al código (05/08).** El Agente de Seguridad cerró el nivel de riesgo de ALTO a MEDIO: (1) si alguien intenta arrancar el servidor sin configurar el permiso de dominio web, ahora falla de inmediato en lugar de quedar abierto a cualquiera; (2) las calificaciones de clientes a riders ahora solo se aceptan dentro de los 7 días post-entrega, cerrando el abuso de notas falsas; (3) el panel de admin tiene un freno de 60 consultas por minuto para evitar saturación; (4) la edición de usuarios ahora valida que el email, teléfono y contraseña tengan formato correcto; (5) la confirmación de pagos tiene su propio freno de 20 consultas por minuto.

- **Pipeline de ventas en 136 prospectos (+14 desde la semana anterior).** Se encontraron dos nuevos negocios en Rappi Villa Alemana (#135 Troncal Urbano Restaurant, Av. Valparaíso 2650; #136 El Bajón de Porvenir, sector Porvenir). Se actualizaron los argumentos de venta con los datos de la semana: SSW Partners cumple 3 semanas en silencio, Rappi ya clasifica negocios de Villa Alemana bajo "Quilpué" en su app, y los Premios Uber Eats del 29/07 siguen como contraste fresco. 4 borradores nuevos listos para envío.

- **La ventana SSW/PedidosYa sigue abierta, pero es hora final.** Han pasado 21 días desde que PedidosYa Chile fue vendida a SSW Partners de Nueva York. SSW no ha comunicado nada a los restaurantes afiliados — la transacción no cierra hasta 2027 como mínimo. Los 7 borradores listos (#27, #28, #30, #33, #60, #90, #102) siguen sin confirmación de envío. Esta es la semana crítica.

- **Rappi Turbo ya es funcional en el corredor Quilpué–Villa Alemana.** El Investigador confirmó que Rappi agrupa negocios de VA bajo la sección "Quilpué" en su app — la distinción geográfica ya desapareció para Rappi. Cada semana sin captar negocios locales es terreno cedido. Dark Kitchen SpA (Roma 131, Viña del Mar) parece estar buscando socios — la ventana de alianza multi-negocio sigue abierta.

- **5 mejoras técnicas identificadas el 03/08 aún sin aplicar.** El Agente de Mejoras documentó con código listo: límite de 500 caracteres en el chat (evita saturación del servidor), autorización correcta al seguir un pedido en tiempo real (evita espionaje GPS), corrección de pérdida de memoria en el rate limiter de respaldo, reducción del 95% en escrituras GPS a la base de datos, y protección adicional en el webhook de sandbox de pagos. Ninguna fue aplicada todavía.

---

## Problemas conocidos y su estado

| Problema | Estado |
|---|---|
| Service Worker rider PWA cachea agresivamente | ✅ Resuelto — SW v6 |
| Notificaciones push en Xiaomi | ⚠️ Requiere acción manual del rider en ajustes |
| AudioContext en Chrome móvil | ✅ Resuelto — toggle Online activa audio y push |
| CORS abierto a cualquier dominio web | ✅ Resuelto esta semana — falla al iniciar si no está configurado |
| Calificaciones de clientes sin ventana temporal | ✅ Resuelto esta semana — solo aceptadas 7 días post-entrega |
| Sin freno de velocidad en panel admin | ✅ Resuelto esta semana — 60 consultas/min |
| Espionaje GPS entre usuarios por WebSocket | 🔴 Abierto — código del fix en reportes/mejoras.md sin aplicar |
| Chat sin límite de longitud | 🔴 Abierto — código del fix en reportes/mejoras.md sin aplicar |
| Pérdida de memoria en rate limiter de respaldo | 🔴 Abierto — código del fix en reportes/mejoras.md sin aplicar |
| Servidor Railway sin respuesta al health check | ⚠️ Sin verificar — dos agentes sin acceso esta semana |

---

## Alertas

**🔴 Servidor en Railway posiblemente caído.** El Agente de Seguridad no obtuvo respuesta al health check el 05/08, y el Monitor tampoco puede contactarlo hoy (07/08). No se puede descartar que sea una limitación del entorno de los agentes (el proxy bloquea Railway), pero es una señal que Matías debe verificar directamente en el dashboard de Railway.

**🔴 CORS_ORIGIN en Railway: hay que confirmar que está configurado.** El fix aplicado esta semana hace que el servidor no arranque si esta variable no está definida en producción. Si no está configurada, el servidor estaría caído por ese motivo.

**🟡 Ventana SSW en hora final.** Los 7 borradores PedidosYa (#27, #28, #30, #33, #60, #90, #102) llevan 21 días esperando. El argumento "SSW lleva 3 semanas sin decirte qué pasa con tu contrato" se enfría si pasan más semanas.

**🟡 #22 Sushi Point Delivery y #15 Melt Pizzas — 42 días consecutivos con borradores activos sin confirmación de envío por parte de Matías.** El pipeline no avanza sin los envíos confirmados.

---

## Decisiones tomadas

- 5 correcciones de seguridad aplicadas y desplegadas (commit `bb96820`, 05/08): CORS fatal en producción, ventana 7 días calificaciones, rate limit admin, validación edición usuarios, rate limit pagos/confirmar.
- 2 nuevos prospectos incorporados al pipeline (#135 Troncal Urbano, #136 El Bajón de Porvenir).
- Argumentos de venta actualizados: SSW 3 semanas en silencio, Rappi clasifica VA bajo Quilpué, post-Premios Uber Eats 29/07.

---

## Prioridades próxima semana

1. **Matías verifica ahora en Railway dashboard** si el servidor está activo y si `CORS_ORIGIN` está configurado — puede ser la causa de que la plataforma esté caída.
2. **Matías envía HOY los 7 mensajes PedidosYa/SSW** — #27 Tribeca Sushi, #28 La Esquina Con Sabor, #30 Poh Che, #33 Casa Festa, #60 Master Sándwich, #90 Buenaventura Pizzería, #102 La Joya. Es la última semana con el argumento fresco.
3. **Aplicar las 3 mejoras críticas de WebSocket** — autorización `pedido:seguir`, límite 500 chars chat, y purga memory leak rate limiter. Código listo en `reportes/mejoras.md`, hay que pegarlo en el archivo correspondiente.
4. **DM a @darkkitchenspa esta semana** — Dark Kitchen SpA (Roma 131, Viña del Mar) podría estar buscando socios estratégicos. Acceso potencial a 5–15 negocios en una sola reunión.
5. **Confirmar envío a #22 Sushi Point y #15 Melt Pizzas** — 42 días con borradores listos. Si no hay respuesta tras el envío, evaluar si seguir intentando.

---

*Informe generado automáticamente — Agente Gerente RepartoJusto — 2026-08-07*
