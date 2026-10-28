# Cookiebot: lo que tiene que hacer Carlos en los paneles

Con el plan Free, el banner se configura en el panel de Cookiebot, no en el código. El código ya está preparado: script en `app/layout.tsx`, CSP en `lib/csp.ts` y puerta del chat de ayuda en `lib/crisp.ts`. Esta guía va en orden. Marca cada paso al hacerlo.

## 0. Cómo está hoy tu cuenta (medido el 28-oct-2026)

Medido con el banner **real** de tu cuenta, sirviendo la build local como `https://www.edudream.es` en el navegador de pruebas (`tests/browser/cookiebot-real.spec.ts`, con `COOKIEBOT_REAL=1`):

| Qué | Resultado | Qué hacer |
|---|---|---|
| ¿Sale en `www.edudream.es`? | ✅ Sí: `www` está cubierto por `edudream.es` | Nada |
| Aceptar y Rechazar del mismo tamaño | ✅ «Permitir todas», «Permitir la selección» y «Denegar»: los tres de 344 × 58 px en el móvil e iguales en el escritorio | Nada |
| Botón de cerrar (×) | ✅ No hay | Nada |
| Scroll, navegar o esperar | ✅ El banner sigue y no se guarda consentimiento | Nada |
| «Configurar cookies» (`Cookiebot.renew()`) | ✅ Vuelve a abrir el banner | Nada |
| Declaración en `/cookies` | ✅ Carga dentro de la página | Ver textos ↓ |
| CSP | ✅ Sin ninguna violación con el script real | Nada |
| **Tamaño en el móvil** | ❌ **Ocupa 828 de 844 px: es un muro** (tapa toda la pantalla). En el escritorio está bien | Paso 2: «Posición: abajo, compacto» |
| **Texto del banner y de la declaración** | ❌ **Es el de serie: «…personalizar el contenido y los anuncios, ofrecer funciones de redes sociales… compartimos información… con nuestros partners de redes sociales, publicidad…». Es falso para Dream** | Paso 2: textos. **Urgente antes de producción** |
| Icono flotante (*Privacy trigger*) | ❌ Sale a la izquierda | Paso 2: desactivarlo. Desde el 28-oct ya no sale dentro de la app (ver abajo) |
| `dream-theme` en la declaración | ⚠️ «No clasificado» (lo encontró el escaneo del 27-oct) | Paso 3: marcarlo como Necesarias |
| Duración de `CookieConsent` | 12 meses (no 1 mes) | Ya está así en `/cookies` |
| Bloqueo `auto` | No bloqueó nada ni avisó. Inconcluso: antes del consentimiento no hay scripts de terceros que bloquear | Nada. El chat va bloqueado por código |
| Accesibilidad (axe) | ⚠️ 1 problema serio de la plantilla (`scrollable-region-focusable`: el texto con scroll no se alcanza con el teclado). Al abrirse, el foco **no** pasa al banner | Se resuelve con un banner compacto sin scroll. El foco no se controla con el plan Free: Premium Lite permite una plantilla propia |

**Dónde sale Cookiebot.** Solo en la landing (`/`), `/terminos`, `/privacidad` y `/cookies` (`COOKIEBOT_PAGES` en `lib/cookie-consent.ts`). Dentro de la app no se carga: antes del consentimiento la app solo usa almacenamiento necesario, así que no necesita banner. Allí la decisión se lee de la cookie `CookieConsent`. «Configurar cookies» de Ajustes lleva a `/cookies` con el banner abierto. Si el alumno entra en la app desde la landing sin recargar, el banner y el icono quedan ocultos.

## 1. Dominio

- [ ] **Configuración → Dominios**: está `edudream.es`. La web vive en **`www.edudream.es`**: `edudream.es` redirige a `www` y el login de Google depende de ello. Según Cookiebot, `example.com` y `www.example.com` cuentan como **un solo dominio**, así que no hay que añadir nada más. Hay que comprobar que el banner sale en `https://www.edudream.es`. Si saliera «domain not authorized», añade `www.edudream.es` como alias del mismo dominio. **No cambies la redirección:** rompería el login.
- [ ] Las previews de Vercel y `localhost` no están cubiertas: allí el banner no sale. No es un fallo.

## 2. Banner (Configuración → Banner de consentimiento)

- [ ] **Idioma**: español (`es`). El código ya manda `data-culture="es"`.
- [ ] **Tipo**: con **«Permitir todas» / «Denegar» / «Personalizar»** en la primera capa, los tres botones del mismo tamaño y color. Si la plantilla Free solo deja resaltado «Permitir», **avísame**: la AEPD pide que rechazar no cueste más que aceptar, y sería motivo para pasar a Premium Lite (~7 €/mes + IVA).
- [ ] **Casillas de categorías desmarcadas** por defecto (Preferencias y Estadísticas).
- [ ] **Sin la categoría «Marketing»**. Si el plan no deja ocultarla, que quede vacía y desmarcada. Dream no usa publicidad ni seguimiento.
- [ ] **Posición**: abajo, compacto. No modal a pantalla completa.
- [ ] **Sin cierre (×), sin «aceptar al hacer scroll» y sin «aceptar al seguir navegando»**. Si el alumno no decide, el banner se queda y solo funcionan las necesarias.
- [ ] **Privacy trigger** (icono flotante para reabrir): **desactivado**. Usamos nuestro enlace «Configurar cookies» del pie y de Ajustes > Privacidad.
- [ ] **Textos** (aprobados por Carlos el 28-oct-2026):
  - Título: **«Tus cookies, tu decisión»**.
  - Texto: **«Dream usa cookies necesarias para que puedas iniciar sesión y la web funcione segura. Con tu permiso, también usamos cookies de preferencias para abrir el chat de ayuda. No usamos cookies de publicidad. Puedes cambiar de opinión cuando quieras en Ajustes o en el pie de página.»**
  - Enlace a la política: **`https://www.edudream.es/cookies`**, con el texto «Política de cookies».
  - **Texto de la declaración** (Configuración → Declaración de cookies), que sale en `/cookies` debajo de nuestra introducción. Cambia el texto de serie por: «Esta es la lista de cookies de Dream, por categorías. Dream no usa cookies de publicidad ni comparte datos con redes sociales.»
- [ ] **Google Consent Mode**: desactivado. Dream no tiene etiquetas de Google.
- [ ] **Bloqueo**: el código manda `data-blockingmode="auto"`, como pediste. El bloqueo automático es de pago. Con el plan Free, Cookiebot puede ignorarlo o avisar en la consola. **No hace falta**: el chat de ayuda está bloqueado por código. Si `auto` diera problemas, en Vercel pon `NEXT_PUBLIC_COOKIEBOT_BLOCKINGMODE=manual` y vuelve a desplegar.

## 3. Cookies que el escáner no ve (añadir a mano)

El escaneo del plan Free solo ve las páginas públicas. **Configuración → Cookies → Añadir cookie**, una por fila:

| Nombre | Proveedor | Categoría | Finalidad (texto para la declaración) | Caducidad | Tipo |
|---|---|---|---|---|---|
| `sb-cxaujyagtpsxvkwkdxbc-auth-token` | edudream.es (Supabase) | Necesarias | Mantiene la sesión iniciada de forma segura. | Persistente, hasta cerrar sesión | HTML Local Storage |
| `sb-cxaujyagtpsxvkwkdxbc-auth-token-code-verifier` | edudream.es (Supabase) | Necesarias | Protege el inicio de sesión con Google (PKCE). | Minutos | HTML Local Storage |
| `dream-login-pending` | edudream.es | Necesarias | Termina el inicio de sesión al volver de Google. | Sesión | HTML Session Storage |
| `dream-theme` | edudream.es | Necesarias | Recuerda el tema claro u oscuro que elijas. | Persistente | HTML Local Storage |
| `dream-reading` | edudream.es | Necesarias | Recuerda la lectura fácil si la activas. | Persistente | HTML Local Storage |
| `dream-ai-mode` | edudream.es | Necesarias | Recuerda el modo de la IA que elijas. | Persistente | HTML Local Storage |
| `dream-privacy-v1` | edudream.es | Necesarias | Recuerda tu elección sobre «Datos de uso». | Persistente | HTML Local Storage |
| `dream-crisp-notice` | edudream.es | Necesarias | Recuerda que ya leíste el aviso del chat de ayuda. | Persistente | HTML Local Storage |
| `dream-qr-token`, `dream-qr-device:*` | edudream.es | Necesarias | Permite subir archivos desde el móvil con el código QR. | Sesión | HTML Session Storage |
| `dream-static-v3`, `dream-static-v3-assets` | edudream.es | Necesarias | Caché de la app instalable: abre más rápido y sin conexión. No guarda datos del alumno. | Persistente | Cache Storage |
| `dream-maint-access` | edudream.es | Necesarias | Acceso del equipo durante el mantenimiento. | 30 minutos | HTTP Cookie |
| `crisp-client/*` | crisp.chat | **Preferencias** | Mantiene la conversación del chat de ayuda. Solo con tu permiso y solo al abrir el chat. | 6 meses | HTTP Cookie |
| `ph_*_posthog` | posthog.com | **Estadísticas** | Estadísticas anónimas, solo si se activan en Ajustes. Hoy no se usa en producción. | Persistente | HTML Local Storage |

Las cookies de `accounts.google.com` son de Google en su dominio: no se añaden.

## 4. Cada vez que cambien las cookies

- Actualiza `docs/cookies-inventario.md` y la tabla de arriba.
- En Cookiebot, **sube la versión del consentimiento** («Renovar consentimiento de todos los usuarios») para que el banner se vuelva a mostrar. Anótalo en `docs/cumplimiento.md`.

## 5. Vercel (variables opcionales)

| Variable | Valor | Para qué |
|---|---|---|
| `NEXT_PUBLIC_COOKIEBOT_CBID` | (vacía) | Usa el id de tu cuenta, `d0c2f6fa-…`. `off` quita Cookiebot. |
| `NEXT_PUBLIC_COOKIEBOT_BLOCKINGMODE` | (vacía) = `auto` | `manual` si `auto` da problemas con el plan Free. |
| `NEXT_PUBLIC_COOKIEBOT_TLD` | (vacía) = `com` | `eu` para usar `consent.cookiebot.eu` (pregunta 4: confirma que tu plan lo permite). |
| `DREAM_CSP` | (vacía) = aplicar | `report-only` para probar la CSP sin bloquear nada, y `off` para quitarla. |

## 6. Cloudflare

Hoy **Cloudflare no está delante de la web**: los DNS están en IONOS y apuntan directamente a Vercel. No hay nada que tocar. Si algún día se activa el proxy de Cloudflare:

- [ ] **Rocket Loader desactivado**: cambia el orden de carga de los scripts y rompe Cookiebot.
- [ ] Ninguna regla de caché ni de WAF sobre `consent.cookiebot.*` (es de terceros, no pasa por tu zona, pero revísalo si añades reglas de «Transform» o de scripts).
- [ ] Repetir la medición del inventario (`scripts/cookies/medir.mjs`): aparecerán `__cf_bm` y quizá `cf_clearance` (Necesarias).
