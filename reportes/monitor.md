# Monitor RepartoJusto
**Última verificación:** 2026-07-22T15:08:33Z
**Estado:** ⚠️ NO VERIFICABLE
**Detalle:** No se pudo conectar a https://repartojusto-production.up.railway.app/health — el proxy del entorno rechazó el túnel CONNECT con HTTP 403 Forbidden (política de red). El servidor puede estar operativo; la verificación falló por restricción de red del entorno, no por caída del servicio.

> **Nota técnica:** El entorno de ejecución remoto bloquea conexiones salientes a dominios externos no permitidos. Para habilitar el monitoreo real, agregar `repartojusto-production.up.railway.app` a la lista de dominios permitidos en la configuración de red del entorno.
