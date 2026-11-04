// Política de cookies (Bloque 5 de Cookiebot). La introducción es nuestra; la
// lista detallada la pinta Cookiebot (cd.js) debajo, y si no carga se muestra
// `cookiesTabla`, que sale del inventario real (docs/cookies-inventario.md).
export const cookies = String.raw`# Política de cookies

*Última actualización: 28 de octubre de 2026 (versión provisional).*

## Qué es una cookie

Una cookie es un archivo pequeño que una web guarda en tu navegador. Dream también usa el almacenamiento del navegador (*localStorage* y *sessionStorage*), que funciona igual. En esta página llamamos «cookies» a todo eso.

## Qué usa Dream

- **Necesarias.** Sirven para iniciar sesión, mantener la web segura y recordar lo que eliges, como la lectura fácil. Funcionan siempre: sin ellas Dream no funciona. No hace falta tu permiso.
- **Preferencias.** Solo para el **chat de ayuda (Crisp)**. Se usan si tú lo permites, y solo cuando abres el chat.
- **Estadísticas.** Solo si activas «Datos de uso» en **Ajustes**. Hoy no están en marcha.
- **Publicidad: ninguna.** Dream no usa cookies de publicidad, de perfiles ni de seguimiento entre webs, ni aunque aceptes todo.

Si rechazas todo, Dream funciona igual: puedes estudiar, chatear y hacer exámenes. Lo único que necesita permiso es el chat de ayuda, y siempre puedes escribirnos a hellodream@edudream.es.

## Cómo cambiar tu elección

Cuando quieras, pulsa **«Configurar cookies»** al pie de esta página o en **Ajustes > Privacidad**. Retirar el permiso es igual de fácil que darlo. Si lo retiras, borramos las cookies del chat de ayuda.

Tu elección se guarda en la cookie **CookieConsent** de Cookiebot, nuestro gestor de cookies, durante 12 meses. Después te lo volveremos a preguntar, y también antes si cambian las cookies o para qué las usamos.

## Cómo borrar las cookies

En tu navegador: **Ajustes > Privacidad > Borrar datos de navegación** (Chrome, Edge), **Ajustes > Safari > Borrar historial y datos** (iPhone) o **Preferencias > Privacidad > Gestionar datos** (Firefox). Si borras las de Dream, tendrás que iniciar sesión de nuevo.

Más información sobre tus datos en la [Política de privacidad](/privacidad).

## Detalle de cada cookie

La lista siguiente la mantiene Cookiebot a partir de un análisis de la web.
`;

/** Respaldo si la declaración de Cookiebot no carga (bloqueador, sin conexión). */
export const cookiesTabla = String.raw`| Nombre | De quién | Para qué | Duración | Tipo |
| --- | --- | --- | --- | --- |
| CookieConsent | Cookiebot (en edudream.es) | Guardar tu elección sobre las cookies | Hasta 12 meses | Necesaria |
| sb-…-auth-token (y su code-verifier al iniciar sesión) | Dream (Supabase) | Mantenerte conectado de forma segura | Hasta que cierres sesión | Necesaria |
| dream-login-pending | Dream | Terminar el inicio de sesión | Mientras la pestaña esté abierta | Necesaria |
| dream-reading, dream-ai-mode | Dream | Recordar la lectura fácil y el modo de la IA que eliges | Hasta que las borres | Necesaria (preferencia elegida) |
| dream-privacy-v1, dream-crisp-notice | Dream | Recordar tus decisiones sobre datos de uso y el aviso del chat | Hasta que las borres | Necesaria |
| dream-qr-token, dream-qr-device | Dream (solo al subir por QR) | Que el móvil pueda subir los archivos | Mientras la pestaña esté abierta | Necesaria |
| dream-static-v3 (caché) | Dream (app instalable) | Abrir más rápido y mostrar una página sin conexión. No guarda tus conversaciones | Hasta la siguiente versión | Necesaria |
| crisp-client/… | Crisp (chat de ayuda) | Mantener tu conversación con soporte | 6 meses | Preferencias, solo con tu permiso |
| Identificador anónimo de PostHog | PostHog | Estadísticas anónimas de uso | Hasta que las borres | Estadísticas, solo si lo activas en Ajustes |
| (nada en tu navegador) | Sentry | Informes de errores | — | Solo si lo activas en Ajustes |

Las cookies de Google al iniciar sesión las pone Google en su propio dominio (accounts.google.com), con su política.
`;
