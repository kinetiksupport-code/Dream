# Reglas de Cloudflare para edudream.es (plan Free)

Para Carlos. Las reglas van listas para copiar en el panel. Yo no he cambiado nada en Cloudflare. Fecha: 2026-10-29.

> **Lo más importante.** Cloudflare protege `www.edudream.es` (las páginas y las pocas rutas `/api` de la web). **No protege Supabase.** La IA, la base de datos, los archivos y `dream-api` van directos del navegador a `cxaujyagtpsxvkwkdxbc.supabase.co`, sin pasar por Cloudflare. Esa parte la protegen Supabase y los límites por cuenta e IP de la app. El dominio propio para Supabase es de pago y no se usa.

## 1. Qué cuesta recursos y por dónde pasa

| Qué | Ruta / acción | Quién la llama | ¿Pasa por Cloudflare? | Límite que tiene hoy |
|---|---|---|---|---|
| Chat con IA (Groq, Cloudflare Workers AI de respaldo) | `dream-api` → `chat` | Alumno con sesión | **No**, va directo a Supabase | 6 por minuto, 50 al día, 60.000 tokens cada 5 h, 1 a la vez; IA global: 8 a la vez |
| Búsqueda web (Tavily) | dentro de `chat` | Alumno con sesión | **No** | 15 búsquedas al día por cuenta |
| Tests, esquemas, juegos, simulacros, ruta de examen | `test_generate`, `scheme_*`, `game_generate`, `exam_*` | Alumno con sesión | **No** | Los del chat y además 5 al día de tipo examen |
| Corrección de respuestas | `test_check_answer`, `test_submit`, `exam_session_submit` | Alumno con sesión | **No** | Los del chat |
| Subir archivos desde el ordenador | `attachment_upload` | Alumno con sesión | **No** | Los del chat y las validaciones de `file-guard.mjs` |
| Generar QR de subida | `upload_session_create` | Alumno con sesión | **No** | 30 códigos por hora y cuenta |
| Subida desde el móvil (QR) | `upload_qr_connect`, `upload_qr_file` | Móvil **sin sesión**, solo el código | **No** (la página `/subir` sí) | Por IP: 30 por minuto y 20 fallos por hora; por código: 10 archivos, 40 MB, 2 a la vez |
| Reclamar / apelación | `mod_appeal_create` | Alumno con sesión | **No** | Ver el prompt de seguridad (B6) |
| Inicio de sesión con Google | Supabase Auth y luego `/auth/callback` | Navegador | Solo `/auth/callback` | Los de Supabase Auth |
| Comprobación de mantenimiento | `POST /api/auth/verify-maintenance` | La app, en cada cambio de pantalla | **Sí** | Ninguno propio (es barata fuera de mantenimiento) |
| Diagnóstico de IP | `GET /api/ip-check` | Solo para pruebas | **Sí** | Ninguno (no consulta nada) |
| Páginas (HTML y datos RSC) | `/`, `/chat`, `/exams`… | Navegador | **Sí** | Ninguno (las protege el DDoS de Cloudflare y de Vercel) |

Los límites por cuenta salen de la tabla `dream_private.limits`, leída el 2026-10-29. Los del QR, de `upload-session.ts`.

**Conclusión.** En la web hay muy pocas rutas caras. Lo que gasta dinero (la IA) va directo a Supabase. Por eso la regla de Cloudflare es una **red de seguridad contra ráfagas evidentes** y no el control principal. El control fino lo hace la app: límite por cuenta y bloqueo de 24 h por IP.

## 2. Regla de límite de tasa (la única gratis)

Cloudflare → `edudream.es` → **Security → WAF → Rate limiting rules → Create rule**.

- **Nombre:** `Dream: ráfagas en API y login`
- **Si las peticiones entrantes cumplen** → **Edit expression** y pega:

  ```
  (starts_with(http.request.uri.path, "/api/") or http.request.uri.path eq "/auth/callback")
  ```

  Si el panel no acepta `starts_with`, usa esta, que hace lo mismo:

  ```
  (http.request.uri.path contains "/api/" or http.request.uri.path eq "/auth/callback")
  ```

- **Con las mismas características:** IP (en el plan Free es la única opción)
- **Cuando la tasa supera:** **1500** peticiones cada **10 segundos**
- **Entonces:** **Block**, durante **10 segundos** (en Free son fijos)
- **Deploy**

### Por qué 1500 cada 10 segundos

Un colegio sale a internet con **una sola IP** para todos (por ejemplo, Fundación Loyola). La regla tiene que dejar pasar a un centro entero aunque todos usen Dream a la vez.

- Cada alumno, al cambiar de pantalla, hace **1** `POST /api/auth/verify-maintenance` (`components/providers.tsx`). Al entrar con Google hace **1** `/auth/callback`.
- Una persona que navega muy rápido cambia de pantalla como mucho cada 3 segundos, es decir, unas **3–4 peticiones cada 10 s**.
- **Caso extremo de colegio:** 300 alumnos activos a la vez detrás de la misma IP (10 clases de 30). 300 × 4 = **1200 cada 10 s**. A eso hay que sumar el inicio de sesión de una clase entera a la vez (+30).
- **1500 queda por encima de ese caso extremo.** Es un umbral conservador, como pidió Carlos.
- Un script de ataque sencillo hace cientos o miles de peticiones **por segundo**, así que con 1500 cada 10 s (150 por segundo) se corta enseguida.

**Datos reales (pocos).** En los registros de Supabase de las últimas 24 h, la IP más activa hizo **128 peticiones a Supabase en 10 s** (p99: 80). Fue una sola persona cargando la app, y todas esas peticiones van a Supabase, **no** a `/api` de la web. Todavía hay muy poco tráfico real para afinar más. Vercel en el plan Hobby solo guarda una hora de registros.

**Revisar en 2 semanas.** En Cloudflare → Security → Analytics, filtra por la ruta `/api/` y mira el máximo de peticiones por IP. Si el pico real de un colegio queda muy por debajo de 1500, se puede bajar a 3 veces ese pico. **Nunca por debajo de 600.**

**Qué NO hace esta regla.**
- No frena el uso de la IA, que va a Supabase.
- No es el bloqueo de 24 h: ese lo hace la app.
- Solo corta ráfagas muy evidentes contra la web durante 10 segundos.

**Por qué no incluye las páginas.** Al navegar, Next.js pide por adelantado los datos de las pantallas a las que enlaza (decenas de peticiones por alumno en pocos segundos). Una regla sobre todas las páginas bloquearía a un colegio. Contra una avalancha de peticiones a las páginas están el DDoS automático de Cloudflare y el de Vercel, y **Under Attack Mode** en caso de emergencia (`docs/plan-ataque.md`).

## 3. Reglas personalizadas extra (quedan 3 libres)

**Propuesta: no añadir ninguna ahora.** El inventario no lo justifica. La web casi no tiene rutas caras y lo caro está en Supabase, donde Cloudflare no llega. Los 3 huecos se reservan así:

1. **Desafío al tráfico extranjero**, preparado pero **desactivado**. Solo durante un ataque (decisión 3). La expresión está en `docs/plan-ataque.md`.
2. Una regla de emergencia sobre las páginas, si un ataque concreto lo pide.
3. Libre.

### Comprobación de que lo ya configurado no rompe nada

Reglas activas: (1) bloquear rutas con `/.env`, `/.git`, `/wp-admin`, `/wp-login` o `/xmlrpc.php`; (2) Managed Challenge si el user agent está vacío.

| Qué | ¿Le afecta? | Comprobado |
|---|---|---|
| Callback de Google (`/auth/callback`) | No: lo abre el navegador, con user agent | `curl` a producción: 200 |
| Manifiesto de la PWA (`/manifest.webmanifest`) | No | 200, no cacheado (`DYNAMIC`) |
| Service worker (`/sw.js`) | No | 200, revalidado en cada visita (`REVALIDATED`) |
| `/.well-known/*` | No: `/.well-known` no contiene `/.git` ni `/.env` | `/.well-known/vercel/…` llega a Vercel (404 normal, `DYNAMIC`) |
| Subida desde el móvil (`/subir`) | No | 200, `no-store`, `DYNAMIC` |
| Petición sin user agent | Sí: desafío | `curl -A ""` → 403. Es lo esperado: un navegador siempre manda user agent |

Riesgo conocido de la regla (1): `contains "/.git"` también bloquea cualquier ruta que empiece por `/.github`. Dream no tiene ninguna.

### Rutas de administración

`/revision`, `/admin`, `/panel` y `/administracion` responden hoy **el mismo 404** que una URL inexistente (comprobado con `curl`: 404, `private, no-cache, no-store`, `DYNAMIC`). **No hay que poner ninguna regla de Cloudflare solo para `/revision`**, porque revelaría que existe. Si algún día se pone una, tiene que aplicarse igual a las cuatro rutas.

## 4. Caché de Cloudflare (comprobado con las cabeceras reales)

Cabecera `cf-cache-status` de producción, 2026-10-29:

| Ruta | `cf-cache-status` | `cache-control` | ¿Bien? |
|---|---|---|---|
| `/`, `/login`, `/chat`, `/settings`, `/privacidad`, `/subir`, `/auth/callback` | `DYNAMIC` (no se guarda) | `private, no-cache, no-store` | Sí |
| Datos de pantalla (RSC, `?_rsc=`) | `DYNAMIC` | `private, no-cache, no-store` | Sí |
| `/api/auth/verify-maintenance` | `DYNAMIC` | — | Sí |
| `/revision`, `/admin`, `/no-existe`, `/.well-known/vercel/…` | `DYNAMIC` | `no-store` | Sí: nunca cachea `/.well-known/vercel/*` |
| `/_next/static/…js` | `MISS` y luego `HIT` | `public, max-age=31536000, immutable` | Sí: tienen un nombre distinto en cada despliegue |
| `/sw.js` | `REVALIDATED` | **`max-age=14400`** (Vercel manda `no-cache`) | **Revisar** |

**Conclusión.** Cloudflare **no guarda HTML ni respuestas con datos del alumno**. Solo guarda los archivos estáticos, que cambian de nombre en cada despliegue, así que no hay riesgo de HTML viejo tras desplegar. **No hace falta una regla de caché «Bypass».**

**Un ajuste recomendado (paso manual, gratis).** Cloudflare cambia la cabecera del service worker de `no-cache` a `max-age=14400` (4 horas). Es su «Browser Cache TTL» por defecto. Cloudflare sí comprueba con Vercel en cada visita, y los navegadores ignoran esa caché para el propio service worker al buscar actualizaciones. Aun así, es más limpio respetar lo que manda Dream:

- Cloudflare → `edudream.es` → **Caching → Configuration → Browser Cache TTL** → **Respect Existing Headers** → Save.
- Después, `curl -sI https://www.edudream.es/sw.js` debe mostrar `cache-control: no-cache`.

## 5. Lo que no he podido comprobar

- **Que el panel acepte `starts_with` en el plan Free.** La documentación no lo dice ni a favor ni en contra. Por eso va la alternativa con `contains`.
- **El pico real de un colegio.** Todavía hay muy poco tráfico. El umbral sale de una estimación (arriba) y hay que revisarlo en 2 semanas.
- **Instalar la PWA desde un móvil real** con Cloudflare delante. He comprobado con `curl` el manifiesto, el service worker y los tres iconos (`/icon-192.png`, `/icon-512.png`, `/icon-maskable.png`: 200), no en un teléfono.
