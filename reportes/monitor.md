# Monitor RepartoJusto
**Última verificación:** 2026-08-18T00:00:00Z
**Estado:** ⚠️ SIN VERIFICAR
**Detalle:** No se pudo completar el health check. El proxy de red del entorno de ejecución remoto bloqueó la conexión a `repartojusto-production.up.railway.app` con HTTP 403 (el dominio railway.app no está en la lista permitida del proxy). El servidor puede estar operativo; la restricción es del entorno de CI/CD, no del servidor.

**Acción recomendada:** Ejecutar el monitor desde un entorno con acceso directo a internet, o agregar `railway.app` a la lista de dominios permitidos en la política de red del entorno.
