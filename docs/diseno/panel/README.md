# Panel de administración · evidencia

Capturas hechas con un navegador real contra una compilación de producción, con **datos sintéticos** y `dream-api` simulado (`tests/browser/panel-admin.spec.ts`). Ninguna lleva datos reales: correos enmascarados, identificadores inventados y un texto de apelación hostil para comprobar que se muestra como texto.

| Captura | Qué enseña |
|---|---|
| `panel-bandeja.png` | Bandeja de solicitudes: apelaciones con plazo de 30 días, baneos propuestos, cuentas en observación, baneos activos, bloqueos de IP (solo prefijo de la huella) y eventos graves |
| `panel-confirmar.png` | Confirmación en dos pasos de una acción grave (baneo permanente) |
| `panel-ficha.png` | Ficha de una cuenta con «Ban user», «Levantar baneo» y «Bloquear su conexión 24 h» |
| `panel-segundo-factor.png` | Pantalla del código de verificación (segundo factor) |
| `panel-bandeja-oscuro.png` | Bandeja en modo oscuro con movimiento reducido |

Comprobado en el navegador: la política de seguridad estricta no produce ninguna violación, no hay peticiones a terceros, el texto hostil no se ejecuta y quien no es administrador ve exactamente la página 404.
