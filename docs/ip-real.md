# IP real del alumno (Cloudflare, Vercel y Supabase)

**Por qué importa.** Los bloqueos de 24 h y los baneos por evasión usan la huella de la IP. Si un atacante pudiera escribir la cabecera de la que se lee la IP, podría hacer que se bloquease a otra persona. Esta página dice de dónde sale la IP, qué se ha comprobado y qué falta por comprobar.

## Dónde se lee la IP (inventario, 2026-10-29)

| Sitio | Antes | Ahora |
|---|---|---|
| `supabase/functions/dream-api/moderation.mjs` (moderación y límites) | `trustedClientIp` con `cf-connecting-ip`, en dos sitios | `getClientIp(headers, env)`, la única lectura de dream-api |
| `supabase/functions/dream-api/upload-session.ts` (subida por QR) | `clientIp`: `cf-connecting-ip`, luego `x-real-ip` y luego el **primer** valor de `x-forwarded-for` (lo escribe el cliente) | `qrIpHash`, que usa `getClientIp`. HMAC con `MOD_IP_PEPPER` si existe |
| Next.js (`app/`, `components/`, `lib/`, `middleware.ts`) | Nadie leía la IP | `lib/client-ip.ts` → `getClientIp(request)`. Hoy solo lo usa el diagnóstico `/api/ip-check` |

Dos pruebas impiden que vuelva a aparecer otra lectura: `tests/client-ip.test.ts` (web) y `tests/moderation.test.ts` (dream-api) fallan si otro archivo lee `x-forwarded-for`, `x-real-ip`, `cf-connecting-ip` o `true-client-ip`.

## dream-api (Supabase): la que más importa

El navegador habla **directamente** con `cxaujyagtpsxvkwkdxbc.supabase.co`. El Cloudflare de `edudream.es` **no interviene** en esas llamadas. Ahí se gasta la IA, así que ahí actúan la moderación y los límites.

**Prueba real (registros de Supabase, últimas 24 h, 830 llamadas a `dream-api`).** Solo se contaron valores; no se ha impreso ninguna IP:

- `cf-connecting-ip` llega en el 100 % de las llamadas y siempre es una IP válida, sin comas ni listas.
- `x-real-ip` es **idéntica** a `cf-connecting-ip` en las 830.
- **Ninguna** es una IP de Cloudflare ni de un proveedor de nube. Es la del visitante.
- `x-forwarded-for` no aparece en los registros de la función.

**Por qué no se puede falsificar.** Supabase pone su propio Cloudflare delante y Cloudflare sobrescribe `CF-Connecting-IP` con la IP que ve. Lo que mande el cliente en esa cabecera se descarta.
- **No lo he comprobado enviando una cabecera falsa a producción**, porque el encargo prohíbe probar ataques contra el Supabase real.
- La garantía en el código: `getClientIp` lee solo esa cabecera, valida que sea una IP y, si falta, devuelve `null` (no se modera a nadie). Las pruebas envían `X-Forwarded-For`, `X-Real-IP`, `True-Client-IP` y `Forwarded` falsos y comprueban que no cambian nada.

**Arreglo de este bloque.** La subida por QR leía el primer valor de `X-Forwarded-For` cuando faltaba la otra cabecera. Con eso, un atacante podía repartir sus intentos entre «IPs» inventadas o gastar el cupo de otra persona. Ahora usa la misma lectura que la moderación. Antes la huella era un SHA-256 sin secreto (se puede deshacer probando todas las IPv4). Ahora es HMAC con `MOD_IP_PEPPER` cuando Carlos cree ese secreto, y SHA-256 mientras tanto.

## Web (Next.js en Vercel)

`getClientIp(request)` (`lib/client-ip.ts`):

1. Solo en Vercel (`VERCEL=1`). Fuera de Vercel no hay IP, porque cualquiera podría escribir la cabecera.
2. Lee `x-real-ip`, que Vercel sobrescribe («we overwrite X-Forwarded-For and do not forward external IPs… to prevent IP spoofing», documentación de cabeceras de Vercel; `x-real-ip` es idéntica).
3. **Nunca** lee `CF-Connecting-IP`. Quien entre por `*.vercel.app` sin pasar por Cloudflare podría inventarla.
4. Si la IP es de un rango oficial de Cloudflare (lista de cloudflare.com/ips, 2026-10-29), devuelve `null`. Sería la del proxy, compartida por miles de personas.

**Prueba real en vista previa** (`dream-nnt6oclll-kinetik1.vercel.app/api/ip-check`, sin Cloudflare delante):

```json
{"pasa_por_cloudflare":false,"en_vercel":true,"ip_de_vercel":"del_visitante","coincide_con_cloudflare":null,"ip_usable":true}
```

Vercel entrega la IP del visitante y `getClientIp` la acepta. La vista previa está protegida con el inicio de sesión de Vercel, así que no he podido enviarle cabeceras falsas desde fuera.

**Con Cloudflare delante: pendiente de comprobar.** Solo se puede probar en `www.edudream.es`, y eso exige desplegar a producción (lo decide Carlos). Vercel dice que reconoce a Cloudflare como proxy verificado (Verified Proxy Lite, automático en todos los planes). Su documentación no aclara si entonces `x-real-ip` es la del visitante o la de Cloudflare. Cuando esté desplegado, abre `https://www.edudream.es/api/ip-check`:

| Resultado | Qué significa | Qué hacer |
|---|---|---|
| `pasa_por_cloudflare: true`, `ip_de_vercel: "del_visitante"`, `coincide_con_cloudflare: true` | Vercel traduce bien la cabecera de Cloudflare | Nada |
| `ip_de_vercel: "de_cloudflare"` | Vercel entrega la IP de Cloudflare | `getClientIp` ya devuelve `null` (no se limita a nadie por IP en la web). Ver la propuesta de abajo |

**Propuesta, no activada, por si sale «de_cloudflare».** Leer `CF-Connecting-IP` **solo** cuando `x-real-ip` (la que fija Vercel, imposible de falsificar) esté dentro de un rango oficial de Cloudflare. Así, quien entre por `*.vercel.app` desde su casa no podría inventar la cabecera, porque su IP no es de Cloudflare. Riesgo que queda: alguien con su propio Worker de Cloudflare. Por eso, antes de activarlo hay que cerrar `*.vercel.app` (Bloque B4) y confirmar el comportamiento de los Workers.

**Hoy no importa mucho.** La web no limita ni modera por IP: todo lo caro va a `dream-api`, que tiene su propia lectura (arriba).

## La IP nunca en claro

- dream-api solo guarda la huella HMAC-SHA256 con `MOD_IP_PEPPER` (moderación) o la huella del QR. Las pruebas comprueban que la IP no aparece en las llamadas a la base de datos ni en los registros, ni siquiera cuando algo falla.
- `/api/ip-check` solo responde «sí/no» y no registra nada. Lo comprueba una prueba.

## Lo que no he podido comprobar

- Qué IP ve Vercel con Cloudflare delante (necesita producción; ver arriba).
- Enviar cabeceras falsas a `dream-api` en producción (prohibido por el encargo; cubierto con pruebas locales y con el comportamiento documentado de Cloudflare).
- `MOD_IP_PEPPER` no existe todavía. Mientras no exista, la moderación por IP no hace nada (falla abierta) y la huella del QR es SHA-256.
