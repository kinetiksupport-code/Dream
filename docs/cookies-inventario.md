# Inventario de cookies y almacenamiento (Bloque 1 de Cookiebot)

*Auditoría del 28 de octubre de 2026 sobre el código que está en producción (commit `b984452`) y sobre `www.edudream.es`. Sin cambios funcionales.*

## Cómo se ha medido

1. **Revisión de código**: búsqueda de `document.cookie`, `cookies()` de `next/headers`, `response.cookies.set`, `localStorage`, `sessionStorage`, `indexedDB`, `caches.` y `navigator.serviceWorker` en `app/`, `components/`, `lib/`, `middleware.ts`, `public/sw.js` y `supabase/functions/dream-api/`.
2. **Producción, contexto limpio** (Playwright, Chromium, `scripts/cookies/medir.mjs`): landing, `/login`, `/cookies`, `/privacidad` y `/subir` sin tocar nada. Después, pulsar «Continuar con Google» hasta llegar a `accounts.google.com`. En cada paso se guardan `context.cookies()`, las claves de `localStorage` y `sessionStorage`, las cachés, las bases de IndexedDB y los dominios de terceros contactados.
3. **Con sesión** (build local de `b984452`, el mismo método que `tests/browser/moderacion-alumno.spec.ts`): Inicio/Chat, Tareas, Apuntes, Exámenes, Dreams, Progreso y Ajustes, con una sesión de prueba y `dream-api` simulado. No se puede automatizar el login real con Google. Luego, la pantalla de baneo con «Hacer una apelación» → «Abrir chat», cargando el **Crisp real**.

## Resultado en una línea

**Hoy, antes de cualquier consentimiento, Dream no pone ninguna cookie.** Ni en la primera visita ni con la sesión iniciada: `context.cookies()` sale vacío en todos los pasos medidos. Solo usa `localStorage`/`sessionStorage` propios y técnicos, más la caché del service worker. El único tercero que guarda algo en el navegador es Crisp, y solo después de que el alumno lo pida.

## Tabla

Para cada elemento: quién lo pone, tipo, finalidad, duración, si es exento según la Guía de cookies de la AEPD (jul. 2023) y la categoría de Cookiebot propuesta.

| Nombre | Quién (dominio) | Tipo | Finalidad | Duración | ¿Exenta? | Categoría |
|---|---|---|---|---|---|---|
| `sb-cxaujyagtpsxvkwkdxbc-auth-token` | Dream (Supabase Auth, en `www.edudream.es`) | `localStorage` | Mantener la sesión iniciada (token de acceso y de refresco) | Hasta cerrar sesión. El token se renueva solo | Sí (autenticación, servicio pedido) | Necesarias |
| `sb-cxaujyagtpsxvkwkdxbc-auth-token-code-verifier` | Dream (Supabase Auth, PKCE) | `localStorage` | Verificador PKCE del login con Google. Se borra al volver de Google | Minutos (lo que dura el login) | Sí (seguridad del login) | Necesarias |
| `dream-login-pending` | Dream | `sessionStorage` | Saber que se vuelve de un login para completar la bienvenida | Pestaña | Sí | Necesarias |
| `dream-theme` | Dream | `localStorage` | Tema claro/oscuro/sistema | Indefinida (hasta borrar) | Sí (preferencia de interfaz) — ver 🟡 1 | Necesarias (preferencia exenta) |
| `dream-reading` | Dream | `localStorage` | Lectura fácil (solo si el alumno la activa) | Indefinida | Sí (preferencia elegida) | Necesarias (preferencia exenta) |
| `dream-ai-mode` | Dream | `localStorage` | Modo de la IA elegido (Rápido, Normal, Pensar más) | Indefinida | Sí (preferencia elegida) | Necesarias (preferencia exenta) |
| `dream-privacy-v1` | Dream | `localStorage` | Guardar la elección de «Datos de uso» de Ajustes | Indefinida | Sí (guarda una decisión del usuario) | Necesarias |
| `dream-crisp-notice` | Dream | `localStorage` | Recordar que el alumno ya leyó el aviso del chat de ayuda | Indefinida | Sí (preferencia elegida) | Necesarias |
| `dream-qr-token`, `dream-qr-device:<8 car.>` | Dream (solo en `/subir`) | `sessionStorage` | Enlace de subida por QR: el token del enlace y la llave aleatoria del móvil, para que recargar tras la cámara no bloquee | Pestaña | Sí (servicio pedido, credencial temporal) | Necesarias |
| `dream-maint-access` | Dream (`/api/auth/verify-maintenance`) | Cookie `HttpOnly`, `Secure`, `SameSite=Strict` | Acceso del equipo durante el modo mantenimiento | 30 min | Sí (seguridad). No aparece en uso normal | Necesarias |
| `dream-static-v3`, `dream-static-v3-assets` | Dream (`/sw.js`) | CacheStorage + service worker | Página sin conexión, iconos y archivos de la app con hash. **No guarda HTML, `/api`, Supabase, `dream-api` ni nada del alumno** (revisado en `public/sw.js`) | Hasta la siguiente versión del SW | Sí (técnica) | Necesarias |
| PostHog (`ph_<token>_posthog`, persistencia `localStorage`) | PostHog, solo si se activa «Analítica de uso» en Ajustes | `localStorage` | Estadísticas anónimas | Indefinida | **No** (medición) | Estadísticas — ver 🟡 2 |
| `crisp-client/*` (según Crisp, `crisp-client/session/<website_id>` y relacionadas) | Crisp, al pulsar «Hacer una apelación» → «Abrir chat» | Cookies propias del dominio de Dream puestas por el script de Crisp + `localStorage` | Sesión del chat de ayuda | 6 meses según Crisp (renovable). Ajustable con `CRISP_COOKIE_EXPIRE` | Discutible. Es un servicio pedido por el usuario, pero de un tercero que guarda datos | **Preferencias** (como pide el prompt) — **sin verificar** |
| `__Host-GAPS` y otras de `accounts.google.com` | Google, en su dominio | Cookies de Google | Login con Google | Las de Google | No las pone Dream | Fuera del banner. Se mencionan en la política |

### Lo que se buscó y **no** existe hoy

- **Cloudflare** (`__cf_bm`, `cf_clearance`, `_cfuvid`): **Cloudflare no está delante de la web.** Los DNS de `edudream.es` están en IONOS (`ns10xx.ui-dns.*`) y `edudream.es` y `www.edudream.es` resuelven directamente a Vercel (`216.198.79.1`, cabecera `server: Vercel`). No hay cookies ni scripts de Cloudflare (ni Bot Fight Mode, ni Web Analytics, ni Rocket Loader). Si se activa el proxy de Cloudflare (prompt `prompt-claude-code-cloudflare-ddos.md`), hay que repetir esta medición.
- **Turnstile**: no está implementado en ninguna rama (no hay `challenges.cloudflare.com` en el código). Cuando llegue, va en «Necesarias» (seguridad).
- **Vercel**: en producción no aparecen `_vercel_jwt` ni `__vercel_toolbar` (medido). Vercel Web Analytics y Speed Insights no están instalados (`package.json`).
- **Sentry**: el código existe con consentimiento propio («Informes de errores» en Ajustes), pero **no hay DSN configurado en Vercel**: en producción no se carga.
- **PostHog**: igual que Sentry. El código existe y está desactivado por defecto, pero **no hay token de PostHog en las variables de Vercel**. No se encontró la URL de PostHog en los archivos JavaScript de la web publicada. Hoy la «Analítica de uso» de Ajustes no hace nada en producción.
- **IndexedDB**: ninguna base en ningún paso.
- **Cookies de servidor** (`Set-Cookie`): solo las de mantenimiento. `dream-api` (Supabase Edge Function) no pone cookies: usa el token en la cabecera `Authorization`.
- **Google Tag Manager, píxeles, publicidad**: ninguno.

### Terceros contactados (medidos)

| Momento | Dominios |
|---|---|
| Primera visita, landing y páginas legales | ninguno |
| Pulsar «Continuar con Google» | `cxaujyagtpsxvkwkdxbc.supabase.co`, `accounts.google.com`, `ssl.gstatic.com`, `lh3.googleusercontent.com` |
| App con sesión | `cxaujyagtpsxvkwkdxbc.supabase.co` (API y `dream-api`) |
| Abrir el chat de ayuda | `client.crisp.chat` (y lo que cargue Crisp) |

## Avisos

🟢 **Nada no exento se carga antes del consentimiento.** No hay nada que marcar en rojo.

🟡 **1. `dream-theme` se escribe en la primera visita aunque el alumno no elija** (guarda `"system"`). No es un identificador ni mide nada, así que el riesgo es mínimo. Aun así, la guía de la AEPD exime las preferencias «elegidas por el usuario». Propuesta para el Bloque 2: escribirlo solo cuando el alumno elige claro u oscuro.

🟡 **2. Dos sitios para decidir sobre estadísticas.** Hoy «Datos de uso» en Ajustes es el consentimiento de PostHog y Sentry. Con Cookiebot habría dos interruptores para lo mismo. Propuesta (Bloque 2): la analítica solo se activa si el alumno la activa en Ajustes **y** Cookiebot tiene «Estadísticas» aceptadas. Mientras PostHog no esté configurado, la categoría «Estadísticas» de Cookiebot queda vacía. **Decide Carlos.**

🟡 **3. Dominio de Cookiebot.** Cookiebot está registrado para `edudream.es`, pero hoy la web vive en **`www.edudream.es`**: `edudream.es` redirige con 308 a `www`, y el login de Google depende de esa redirección (`lib/auth-redirect.ts`, URLs de Supabase). Cookiebot trata `example.com` y `www.example.com` como **un solo dominio**, así que no debería hacer falta cambiar la redirección. Hay que confirmarlo en el panel: el banner debe salir en `www.edudream.es`. **No se ha tocado la redirección.**

## Sin verificar

- **Cookies exactas de Crisp.** En el navegador automatizado, el script de Crisp (`l.js`) se descarga pero no llega a abrir el chat, así que no se pudieron leer sus cookies. Los nombres y la duración salen de la documentación de Crisp ([Cookie & IP policy](https://help.crisp.chat/en/article/crisp-chatbox-cookie-and-ip-policy-1147xor/), [Web SDK](https://docs.crisp.chat/guides/chatbox-sdks/web-sdk/cookie-policies/)). Hay que comprobarlo a mano en un navegador normal: Ajustes del navegador → Cookies de `www.edudream.es` tras abrir el chat.
- **El login real con Google y la vuelta a `/auth/callback`** no se pueden automatizar. El verificador PKCE sale del código de `@supabase/auth-js` (`${storageKey}-code-verifier`).
- **El iframe de Turnstile**: no existe todavía.
- **La PWA instalada** (modo *standalone*): usa el mismo origen y el mismo almacenamiento. No se midió aparte.
