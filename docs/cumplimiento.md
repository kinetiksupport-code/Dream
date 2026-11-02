# Cumplimiento: registro de cambios

Un apunte por cambio que afecte a los textos legales, a las cookies o a los consentimientos. Lo más nuevo, arriba.

## Cookies

| Fecha | Cambio | ¿Renovar el consentimiento en Cookiebot? |
|---|---|---|
| 2026-10-28 | Cookiebot solo en la landing, Términos, Privacidad y `/cookies`; no dentro de la app. En la app, «Permitir y abrir» del chat de ayuda vale para esa visita. | No: no cambian las cookies ni sus finalidades. |
| 2026-10-28 | Cookiebot instalado (Bloques 1–6). Categorías: Necesarias, Preferencias (Crisp), Estadísticas (PostHog, no activo en producción). Marketing vacía. Nueva política `/cookies`. | No: es la primera versión. |

Cuando cambie la lista de cookies o sus finalidades: actualizar `docs/cookies-inventario.md` y `docs/cookiebot-panel.md`, y en el panel de Cookiebot pedir de nuevo el consentimiento a todos («Renovar»). La renovación es obligatoria, como mucho, cada 24 meses (Guía de cookies de la AEPD). La cookie `CookieConsent` dura 12 meses (medido el 28-oct-2026), así que Cookiebot vuelve a preguntar cada año.
