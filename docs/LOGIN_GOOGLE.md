# Login con Google: «requested path is invalid»

## Causa

El texto `{"error":"requested path is invalid"}` no está en el código de Dream: lo devuelve la raíz del proyecto de Supabase. Se puede comprobar con `curl https://cxaujyagtpsxvkwkdxbc.supabase.co/`, que responde exactamente eso.

Esto pasa así:
1. El login pide a Supabase que vuelva a `${location.origin}/auth/callback`. Si se entra por `https://edudream.vercel.app`, pide volver a `https://edudream.vercel.app/auth/callback`.
2. Esa dirección no está en las Redirect URLs de Supabase. Por eso Supabase la ignora y manda al alumno a la Site URL.
3. La Site URL acaba en la dirección del propio proyecto de Supabase, que no tiene página: sale el texto en blanco.

Los registros lo confirman: desde `edudream.vercel.app` el callback responde 302 y después no hay intercambio `/auth/v1/token`, mientras que desde `www.edudream.es` sí lo hay.

**Confirmado:**
- El texto sale de la raíz de Supabase.
- El código desplegado construye el `redirectTo` con `location.origin`.

**No confirmado:** el valor exacto de la Site URL y de las Redirect URLs. No tengo acceso a esa pantalla de Supabase.

## Qué cambia en el código

| Archivo | Cambio |
|---|---|
| `lib/auth-redirect.ts` | `getAuthRedirectUrl()` es el único sitio que construye la dirección de vuelta. En producción usa `NEXT_PUBLIC_SITE_URL`; en local y en previews de Vercel, `location.origin`. Si la variable falta o está mal escrita, también usa `location.origin`, como hasta ahora. |
| `app/login/page.tsx` y `app/maintenance/page.tsx` | Usan `getAuthRedirectUrl()`. Eran los dos únicos sitios con `redirectTo`. |
| `middleware.ts` | En producción, cualquier dirección que no sea la principal (como `edudream.vercel.app`) redirige con 308 a `https://www.edudream.es`, con la misma ruta y los mismos parámetros. No toca `/api`, `/_next`, las peticiones que no son GET, las previews ni local. Así el PKCE empieza y termina en el mismo dominio. |
| `app/auth/callback/page.tsx` | Si vuelve con `error`, sin `code` o con un fallo de PKCE, manda a `/login?error=<código>`. Nunca deja una página en blanco. |
| `app/login/page.tsx` | Muestra el mensaje en español y el botón «Volver a intentarlo». |

Mensajes:
- «Has cancelado el acceso con Google.»
- «Google no pudo completar el acceso.»
- «Google no devolvió el permiso de acceso.»
- «El acceso empezó en otra dirección de Dream. Vuelve a intentarlo desde aquí.»
- «No se pudo abrir tu sesión.»

## Ajustes manuales para Carlos (yo no los toco)

**Supabase › Authentication › URL Configuration**
- Site URL: `https://www.edudream.es`
- Redirect URLs:
  - `https://www.edudream.es/**`
  - `https://edudream.es/**`
  - `https://edudream.vercel.app/**`
  - `https://*-<equipo>.vercel.app/**` para las previews. El equipo parece ser `kinetik1`, porque las previews salen como `dream-git-…-kinetik1.vercel.app`. Confírmalo.
  - `http://localhost:3000/**`

**Vercel › Settings › Environment Variables**
- `NEXT_PUBLIC_SITE_URL=https://www.edudream.es`, solo en Production. Hay que volver a desplegar, porque la variable se incrusta al compilar.

**Google Cloud Console › Credenciales OAuth**
- Único URI de redirección autorizado: `https://cxaujyagtpsxvkwkdxbc.supabase.co/auth/v1/callback`.

Con el código nuevo, basta con la Site URL y `https://www.edudream.es/**`, porque producción siempre vuelve a www. El resto de entradas cubren las previews, el entorno local y el periodo de transición.

## Producción frente al repositorio (16/10/2026)

- `edudream.es` ya redirige a `www.edudream.es` con un 308 configurado en Vercel.
- `edudream.vercel.app` sirve la web directamente, sin redirección. Por ahí entra el fallo.
- No tengo permiso para ver los despliegues de Vercel (la API responde 403), así que lo he comprobado mirando el código publicado:
  - En `www.edudream.es` no existen `/privacidad` ni `/cookies` (404).
  - Ajustes contiene textos que solo están en `chore/limpieza-dream`: «Sin nombre en tu cuenta», «Ya no tienes conversaciones guardadas.» y «Eliminando…».
  - Por tanto, producción tiene el código de limpieza (#8/#11), no `feature/dream-ui-pwa` ni `feature/legal-pages`.
  - Diferencia con `feature/dream-ui-pwa`: 18 commits de limpieza (Ajustes, borrado de cuenta, `dream-api` v24, pruebas). El login es igual en los dos: los dos usan `location.origin`.

## Evidencia

**Capturas de la pantalla de login tras volver de Google con un error**, en `docs/diseno/login-google/`:
- `login-error-movil-claro.webp`
- `login-error-movil-oscuro.webp`
- `login-error-escritorio-claro.webp`
- `login-error-escritorio-oscuro.webp`

**Redirecciones medidas en local** con `next start`, compilado con `NEXT_PUBLIC_SITE_URL=https://www.edudream.es`. En cada caso se cambia la cabecera `Host`:

| Host | Ruta | Resultado |
|---|---|---|
| `edudream.vercel.app` | `/login?expired=1` | 308 → `https://www.edudream.es/login?expired=1` |
| `edudream.es` | `/login?expired=1` | 308 → `https://www.edudream.es/login?expired=1` |
| `edudream.vercel.app` | `/maintenance` | 308 → `https://www.edudream.es/maintenance` |
| `www.edudream.es` | `/login` | 200, sin redirección (ni bucle) |
| `localhost` | `/login` | 200 |
| `edudream.vercel.app` | `POST /api/auth/verify-maintenance` | sin redirección |

**Pruebas:**
- `tests/auth-redirect.test.ts`: 6 pruebas unitarias. Cubren producción, previews, local, variable ausente o mal escrita, hosts secundarios y casos que nunca se redirigen.
- `tests/browser/login-google.spec.ts`: 5 pruebas de navegador.
  - «Continuar con Google» pide `redirect_to=<origen>/auth/callback` con PKCE (`s256`).
  - Los tres fallos de vuelta (cancelado, error de Google y sin `code`) muestran su mensaje y «Volver a intentarlo».
  - Un código desconocido nunca enseña el texto en crudo.
