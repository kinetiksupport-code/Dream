# Cabeceras de seguridad de edudream.es

Qué manda la web en cada respuesta y por qué. Lo comprueba `tests/browser/cabeceras.spec.ts` en `/`, `/login`, `/chat`, `/api/ip-check`, `/revision` y las rutas señuelo. `tests/security-headers.test.ts` comprueba la lista. Fecha: 2026-10-29.

| Cabecera | Valor | Dónde se pone | Para qué |
|---|---|---|---|
| `Content-Security-Policy` | Con nonce nuevo en cada petición, `'strict-dynamic'`, sin `unsafe-eval`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'` | `middleware.ts` + `lib/csp.ts` (el panel, `lib/admin-route.ts`) | Que solo se ejecute el código de Dream y de los servicios que usa |
| `X-Frame-Options` | `DENY` | `lib/security-headers.ts` | Que nadie meta Dream dentro de otra web (lo mismo que `frame-ancestors 'none'`, para navegadores antiguos) |
| `X-Content-Type-Options` | `nosniff` | `lib/security-headers.ts` | Que el navegador no adivine el tipo de un archivo |
| `Referrer-Policy` | `strict-origin-when-cross-origin` (`no-referrer` en `/subir` y en el panel) | `lib/security-headers.ts`, `middleware.ts` | No enviar a otras webs la dirección completa |
| `Permissions-Policy` | `camera=(self), microphone=(), geolocation=(), payment=(), usb=(), display-capture=()` | `lib/security-headers.ts` | Cámara solo para Dream (subir fotos de apuntes). Micrófono, ubicación y demás, para nadie |
| `Cross-Origin-Opener-Policy` | `same-origin` | `lib/security-headers.ts` | Que una ventana de otra web no pueda manejar la de Dream |
| `Strict-Transport-Security` | Hoy: `max-age=63072000` (la pone **Vercel** sola). Con `DREAM_HSTS=on`: `max-age=63072000; includeSubDomains` | Vercel / `lib/security-headers.ts` | Usar siempre HTTPS. **Nunca `preload`** |

## Por qué hay `'unsafe-inline'` en `style-src`

El banner de Cookiebot y el chat de Crisp meten estilos en línea y no aceptan nonce. Es solo para estilos, nunca para scripts. El panel no carga ninguno de los dos y no lo lleva (`style-src 'self'`, solo `style-src-attr 'unsafe-inline'`).

## Por qué algunas cosas valen para todas las páginas

Next.js cambia de pantalla **sin recargar**: la CSP y la `Permissions-Policy` que valen son las de la **primera** página que se abrió. Si la cámara o Turnstile solo se permitieran en `/subir` o en `/reclamar`, fallarían al llegar a ellas desde otra pantalla. Por eso la cámara va en `camera=(self)` (solo Dream, sin terceros) en todo el sitio. Turnstile entra en la CSP de toda la app, pero su script solo se descarga donde se usa (`docs/turnstile.md`).

## HSTS: ya está activo (lo pone Vercel)

**Descubierto el 2026-10-29:** `www.edudream.es` y `edudream.es` ya responden `strict-transport-security: max-age=63072000` (2 años), sin `includeSubDomains` ni `preload`. Vercel lo pone solo en los dominios propios. Así que la parte principal de la decisión 5 ya se cumple.

Lo que queda, con fecha (paso manual de Carlos):

- **El 5 de noviembre de 2026** (7 días sin problemas con Cloudflare): Vercel → proyecto `dream` → Settings → Environment Variables → `DREAM_HSTS` = `on` (Production) → volver a desplegar.
  - Eso añade `includeSubDomains`. Afecta a los subdominios de `www.edudream.es`. Para el apex `edudream.es` lo seguiría decidiendo Vercel.
  - No toca el correo: el correo de IONOS no va por el navegador.
- **No activar el HSTS de Cloudflare** (SSL/TLS → Edge Certificates → HSTS). Una sola fuente, para no mandar dos cabeceras distintas.
- **Nunca `preload`.** Meter el dominio en la lista de los navegadores tarda meses en deshacerse.

Cómo deshacerlo: borrar `DREAM_HSTS` y redesplegar. Los navegadores que ya la vieron la recuerdan hasta 2 años. Por eso solo se activa cuando todo va bien con HTTPS.

## La puerta trasera `*.vercel.app` (decisión 6)

Quien entra por `edudream.vercel.app` (o por la URL de un despliegue de producción) llega a Vercel **sin pasar por Cloudflare**.

**En el código** (`lib/auth-redirect.ts` + `middleware.ts`), solo en producción:
- Cualquier GET a otra dirección que no sea `www.edudream.es` → **308 a `www.edudream.es`**, con la misma ruta. Incluye `/api` y los iconos; antes se dejaban pasar.
- Cualquier POST/PUT/… → **421** («Usa www.edudream.es»). Nada legítimo escribe ahí. Redirigirlo solo provocaría un POST cruzado.
- Solo quedan fuera `/_next/static/…` (archivos de la versión, públicos y en caché), porque el middleware no los ve.
- Las **vistas previas no cambian**: tienen `NEXT_PUBLIC_DREAM_ENVIRONMENT=preview` y nunca redirigen. El **callback de Google** vuelve siempre a `www.edudream.es` (`getAuthRedirectUrl`). Lo comprueban `tests/auth-redirect.test.ts` y `tests/browser/login-google.spec.ts`.

**En Vercel** (paso manual, más seguro porque actúa antes que el código):
1. Vercel → proyecto `dream` → **Settings → Domains** → `edudream.vercel.app` → **Edit** → **Redirect to** `www.edudream.es` (308) → Save.
2. Vercel → **Settings → Deployment Protection** → **Vercel Authentication**: **Standard Protection**. Ya está así: lo he comprobado, porque la vista previa me pidió iniciar sesión. Protege las vistas previas y las URL de cada despliegue.

## `/revision` y las rutas de administración

- `/admin`, `/panel` y `/administracion` dan **exactamente** el mismo 404 que una dirección inexistente: mismo estado y mismas cabeceras. Lo comprueba la prueba.
- **`/revision` es hoy la ruta real del panel**, porque `ADMIN_PANEL_PATH` no está configurada y vale la de por defecto. Para quien no es administrador da 404 y nunca enseña el panel. Pero lleva las cabeceras estrictas del panel (otra CSP, `no-referrer`, `noindex`), así que **se puede distinguir** de una dirección inexistente. Lo he comprobado en producción con `curl`.
  - **Arreglo (paso manual de Carlos):** elegir una ruta secreta difícil de adivinar (por ejemplo `/r-` seguido de 12 letras y números al azar) y ponerla igual en Vercel (`ADMIN_PANEL_PATH`) y en los secretos de `dream-api` (`ADMIN_PANEL_PATH`), y luego desplegar las dos (`docs/PANEL_ADMIN.md`). Desde ese momento `/revision` es un señuelo más, idéntico a cualquier 404.
  - No se iguala por código porque habría que darle al panel la CSP de la app, que es más débil.

## El service worker

`public/sw.js` solo guarda la página sin conexión, los iconos y los archivos con hash de `/_next/static/`. **Nunca** guarda páginas (HTML), `/api`, `dream-api`, Supabase, subidas ni nada con credenciales. Revisado, sin cambios.

## Lo que no he podido comprobar

- Las cabeceras nuevas (`Permissions-Policy`, `Cross-Origin-Opener-Policy`) en producción: necesitan un despliegue. Están comprobadas en local con `next start`.
- Que abrir la cámara desde «Hacer foto» siga funcionando en un móvil real con `camera=(self)`. Esa cámara se abre con `<input capture>`, la del sistema; la prueba es de escritorio.
