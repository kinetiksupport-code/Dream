export const cookies = String.raw`# Almacenamiento en tu dispositivo y cookies

*Última actualización: 20 de octubre de 2026 (versión provisional).*

Dream guarda pequeños datos en tu navegador. Los necesarios para que funcione no requieren consentimiento; los de estadísticas solo se activan si tú lo aceptas en Ajustes.

| Qué | Para qué | Tipo | Consentimiento |
| --- | --- | --- | --- |
| Sesión de inicio de sesión (Supabase / Google) | Mantenerte conectado | Necesario | No hace falta |
| dream-theme (almacenamiento local) | Recordar tema claro u oscuro | Necesario | No hace falta |
| dream-ai-mode (almacenamiento local) | Recordar el modo de la IA que eliges (Rápido, Normal o Pensar más) | Necesario | No hace falta |
| dream-login-pending (almacenamiento de sesión) | Completar el inicio de sesión | Necesario | No hace falta |
| Preferencias de privacidad (almacenamiento local) | Recordar tu elección sobre estadísticas y errores | Necesario | No hace falta |
| Caché de la app instalable (service worker) | Cargar más rápido y mostrar una página sin conexión; solo guarda archivos de la app, no tus conversaciones | Necesario | No hace falta |
| Identificador anónimo de PostHog (almacenamiento local) | Estadísticas anónimas de uso | Analítico | **Sí**, desactivado por defecto |
| Informes de errores de Sentry | Detectar fallos | Diagnóstico | **Sí**, desactivado por defecto |
| dream-crisp-notice (almacenamiento local) | Recordar que ya leíste el aviso del chat de ayuda | Necesario | No hace falta |
| Cookies y almacenamiento local de Crisp | Mantener tu conversación con soporte | Funcional (de Crisp) | Solo se crean si abres el chat de ayuda y aceptas el aviso |

Dream no usa cookies de publicidad ni de seguimiento entre webs. Los archivos que subes se mantienen solo en memoria mientras los preparas y no se guardan en tu dispositivo. Los proveedores de IA (Groq y Cloudflare) y de búsqueda (Tavily) solo reciben datos desde nuestro servidor: no ponen cookies ni guardan nada en tu navegador.

**Chat de ayuda (Crisp).** Crisp no se carga al abrir Dream. Solo se carga cuando pulsas «Hablar con soporte» en Ajustes y aceptas el aviso; a partir de ese momento Crisp puede usar cookies o almacenamiento local en tu navegador para mantener la conversación. Más detalles en su [política de cookies](https://crisp.chat/en/cookies/).

Puedes borrar estos datos desde los ajustes de tu navegador, y cambiar tu elección de estadísticas y errores en cualquier momento en **Ajustes > Datos de uso**.

Más información sobre el tratamiento de tus datos en la [Política de privacidad](/privacidad).
`;
