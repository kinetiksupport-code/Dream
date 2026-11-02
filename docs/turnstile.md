# Turnstile («no soy un robot») en Dream

Turnstile es la comprobación «no soy un robot» de Cloudflare: gratis y sin imágenes. Casi siempre es invisible o es un clic. Decisión de Carlos (2026-10-29): **solo** donde un bot haría daño o gastaría IA.

## Dónde sale

| Dónde | Cuándo | Acción (`action`) |
|---|---|---|
| Subida por QR desde el móvil (`/subir`) | Siempre, antes de conectar con el ordenador | `subida_qr` |
| «Reclamar» (formulario de apelación) | Siempre, antes de enviar | `reclamar` |
| Primera acción de IA de una cuenta nueva | **Solo si la app sospecha** (ver abajo) | `primera_ia` |

**No sale** en el inicio de sesión, la landing, las páginas legales ni el resto de pantallas.

### Cuándo «sospecha» la app (primera acción de IA)

Se cumplen las cuatro condiciones (`suspiciousNewAccount` en `supabase/functions/dream-api/moderation.mjs`):

1. La cuenta se creó hace **menos de 24 h**.
2. La conexión **no parece un colegio**: menos de 5 cuentas distintas en la última hora desde esa IP. En un colegio, muchas cuentas nuevas a la vez es normal.
3. La conexión va deprisa: **20 o más** peticiones de IA en un minuto o **75 o más** en una hora. Es la mitad de lo que ya bloquea la moderación.
4. La cuenta **no ha usado la IA** en la ventana actual de 5 horas.

Solo funciona con la moderación en `MOD_MODE=enforce`. Con `off` u `observe` (como ahora) no se pide nunca. Al pasar la comprobación, la petición se repite una vez con el token y la ventana de uso se abre, así que no vuelve a salir en esas 5 horas.

## Cómo se valida (siempre en el servidor)

`supabase/functions/dream-api/turnstile.mjs`:

- Llama a `https://challenges.cloudflare.com/turnstile/v0/siteverify` (POST con `secret`, `response`, la IP del visitante y una clave de reintento).
- Comprueba que `success` sea verdadero y que el `hostname` sea `edudream.es` o `www.edudream.es`.
- Comprueba que la `action` sea la de esa pantalla: un token de «Reclamar» no vale para el QR.
- Comprueba que el token tenga **menos de 5 minutos**.
- El token **vale una sola vez**. Cloudflare rechaza los repetidos y Dream, además, recuerda los usados. Dos peticiones simultáneas con el mismo token no pueden pasar las dos (lo comprueba una prueba).
- **Falla de forma segura:** si Cloudflare no responde en 5 s, la acción **no** se hace y sale «No hemos podido comprobar que eres una persona, vuelve a intentarlo».
- Nunca se registra el token, la clave ni la IP.
- **Sin `TURNSTILE_SECRET_KEY` no se pide nada.** Así se puede desplegar el código antes de crear el widget.

En el navegador (`lib/turnstile.ts`, `components/human-check/`):

- El script de Cloudflare se carga **solo** en las pantallas que lo usan.
- Modo managed, en español, con el tema claro u oscuro de Dream.
- Etiqueta visible «Comprobación de seguridad».
- Tras un error o tras usar el token, el widget se reinicia solo.

**CSP.** `https://challenges.cloudflare.com` solo se añade a `script-src` y `frame-src`, y solo si existe la Site Key. Va en todas las páginas de la app, no solo en las tres pantallas. Motivo: Next.js cambia de pantalla sin recargar, y la CSP que manda es la de la primera página que se abrió. Si un alumno entra por `/chat` y luego va a «Reclamar», la CSP de `/chat` tiene que permitirlo. Lo comprueba una prueba de navegador, junto con que el script no se descarga en la landing, el login ni las páginas legales.

## Supabase Auth: CAPTCHA desactivado (a propósito)

La documentación de Supabase dice que su protección CAPTCHA es para los formularios de **registro, inicio de sesión y restablecer contraseña** (correo y contraseña, enlace mágico, sesiones anónimas). Dream solo usa **Google** (`signInWithOAuth`), y esa documentación no lo cubre. Activarlo podría romper el inicio de sesión. **No se activa.** Turnstile protege lo que importa (QR, reclamaciones e IA) dentro de `dream-api`.

## Pasos manuales de Carlos (cuando quieras activarlo)

1. Cloudflare → menú izquierdo **Turnstile** → **Add widget**.
   - **Widget name:** `Dream`
   - **Hostnames:** añade `edudream.es` y `localhost`. Con `edudream.es` ya vale `www.edudream.es`.
   - **Widget Mode:** **Managed**
   - **Pre-clearance:** No
   - **Create**
2. Copia la **Site Key** (es pública) → Vercel → proyecto `dream` → Settings → Environment Variables → `NEXT_PUBLIC_TURNSTILE_SITE_KEY` en **Production** y **Preview**.
3. Copia la **Secret Key** (es secreta: no la pegues en ningún chat ni archivo) → Supabase → Edge Functions → Secrets → `TURNSTILE_SECRET_KEY`.
4. Orden: **primero la Site Key en Vercel y un despliegue**, **luego** el secreto en Supabase. Si fuera al revés, durante unos minutos el móvil no podría subir por QR porque el servidor pediría un token que la página aún no sabe pedir.
5. Comprueba: abre un QR desde el ordenador, escanéalo con el móvil y verás «Una comprobación rápida» un momento antes de conectar.

**Para desactivarlo en una emergencia:** borra `TURNSTILE_SECRET_KEY` en Supabase. Con eso deja de pedirse, aunque la página siga mostrando el widget.

## Pruebas

- `tests/turnstile.test.ts` (servidor, Cloudflare simulado):
  - token ausente, inválido, reutilizado, simultáneo, de otro dominio, de otra acción o caducado;
  - caída de Cloudflare (error, 500, 429, cuelgue cortado a los 5 s y clave mal puesta);
  - sin clave;
  - nada en los registros;
  - cuándo sospecha;
  - que la puerta y «Reclamar» respetan la respuesta.
- `supabase/tests/upload_session_deno.mjs`: sin comprobación válida el móvil no conecta y no se toca la base de datos.
- `scripts/security/turnstile-real.mjs`: contra el `siteverify` **real** de Cloudflare con sus claves de prueba. La clave que «siempre pasa» responde con el dominio `example.com` y sin acción, y Dream la **rechaza**. Eso confirma que se comprueban el dominio y la acción.
- `tests/browser/turnstile.spec.ts`: navegador real con la Site Key de prueba de Cloudflare (QR, «Reclamar», primera acción de IA, cancelar, CSP). Capturas en `docs/diseno/turnstile/`.

## Lo que no he podido comprobar

- El widget con las **claves reales de Dream** (no existen todavía). Lo comprobado es con las claves de prueba de Cloudflare.
- Que `siteverify` devuelva `www.edudream.es` o `edudream.es` como `hostname` con la clave real. Se aceptan los dos.
- El comportamiento con lectores de pantalla dentro del iframe de Cloudflare. Es de Cloudflare; Dream pone la etiqueta y el mensaje de error accesibles.
