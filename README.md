# Dream

Dream es una web educativa en español para estudiantes. Te ayuda a entender lo que estudias: preguntas, subes tus apuntes, preparas exámenes y practicas con tests. Dream guía con pistas y preguntas; no entrega ejercicios resueltos.

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript estricto, Tailwind CSS 4.
- **Backend**: Supabase (Auth con Google, Postgres con RLS) y la Edge Function `dream-api`.
- **IA**: modos «Rápido» y «Normal» con Groq; «Pensar más» y el respaldo con Cloudflare Workers AI (apagados hasta el OK, ver [docs/MODOS_IA.md](docs/MODOS_IA.md)); búsqueda web con Tavily. Todo solo desde `dream-api`. Las claves viven en los secretos de Supabase, nunca en este repositorio.
- **Plan**: gratis, sin cobros.

## Documentos

| Documento | Contenido |
| --- | --- |
| [DESIGN_IMPLEMENTATION.md](DESIGN_IMPLEMENTATION.md) | Diseño de Claude Design: mapa pantalla → código y adaptaciones |
| [EXAMS_IMPLEMENTATION.md](EXAMS_IMPLEMENTATION.md) | Exámenes: rutas, migraciones, recuperación y límites |
| [OBSERVABILITY.md](OBSERVABILITY.md) | PostHog y Sentry con consentimiento |
| [docs/security/](docs/security/REPORT.md) | Seguridad, admisión y pruebas de carga ([auditoría](docs/security/AUDIT.md), [operación](docs/security/OPERATIONS.md)) |
| [docs/MODOS_IA.md](docs/MODOS_IA.md) | Modos de la IA, límite por ventanas de 5 h y respaldo con Cloudflare |
| [QA.md](QA.md) | Qué se ha verificado y qué no |
| [LIMPIEZA.md](LIMPIEZA.md) | Inventario de la limpieza y decisiones pendientes |
| [docs/README.md](docs/README.md) | Referencias de diseño guardadas en `docs/` |

## Ejecutar

```bash
npm install
cp .env.example .env.local   # completar las variables públicas
npm run dev                  # http://localhost:3000
```

Antes de subir cambios:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

`npm run test:browser` (Playwright) necesita el build en marcha en el puerto 3000 (`npm start`) y Chromium (`npx playwright install chromium`, o `PLAYWRIGHT_CHROMIUM_EXECUTABLE` con un Chromium ya instalado). Node 22 o superior.

## Variables

Todas están en [.env.example](.env.example).

| Variable | Dónde | Para qué |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Cliente | Sesión de Supabase (la clave publishable es pública por diseño) |
| `NEXT_PUBLIC_DREAM_API_URL` | Cliente | URL de la Edge Function `dream-api` |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST` | Cliente | Analítica opcional (sin ellas, el interruptor aparece como «No disponible») |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Cliente / servidor | Diagnóstico de errores opcional |
| `MAINTENANCE_MODE`, `MAINTENANCE_COOKIE_SECRET` | Servidor | Modo mantenimiento (`middleware.ts`, `lib/maintenance.ts`) |

Las variables `NEXT_PUBLIC_*` se incrustan al compilar: si cambian en Vercel, hay que volver a desplegar.

## Acceso

Solo con Google (`/login` → `/auth/callback`, PKCE). En Supabase → Authentication → URL Configuration deben estar permitidos `http://localhost:3000/auth/callback`, el dominio de producción y las URL de preview de Vercel que se quieran usar. Las credenciales OAuth de Google se guardan en Supabase, nunca en el frontend.

Con `MAINTENANCE_MODE=true`, solo las cuentas de la lista de `lib/maintenance.ts` pueden entrar; el resto ve `/maintenance` y las API responden 503.

## Rutas

| Ruta | Pantalla |
| --- | --- |
| `/` | Landing pública |
| `/login`, `/auth/callback`, `/maintenance` | Acceso |
| `/chat` | Inicio (composer y atajos) |
| `/chat?c=<id>` | Conversación |
| `/chat?view=recent` | Historial |
| `/tasks` | Tareas (unidades de estudio de tus exámenes) |
| `/notes` | Apuntes (materiales subidos a tus exámenes) |
| `/exams` y subrutas | Exámenes: plan, estudio, simulacros y resultados |
| `/tests/[id]` | Test de práctica o examen |
| `/settings` | Ajustes: cuenta, tema, instalar, privacidad |
| `/more` | «Más» en móvil |
| `/progress` | Estado del progreso (sin historial consultable todavía) |

## Cómo está hecho

- `lib/dream-api.ts` es la única capa que habla con `dream-api`. Envía `Authorization: Bearer <token de sesión>` y `apikey`. Los errores del backend se muestran tal cual; las mutaciones no se reintentan solas.
- `lib/streaming.ts` lee el chat en NDJSON (`delta`, `activity`, `complete`, `error`) y conserva el texto recibido si la respuesta se corta.
- `components/markdown.tsx` carga Markdown y KaTeX en diferido, sin HTML del modelo (`skipHtml`, `trust: false`).
- **Adjuntos**: hasta 4 por mensaje (8 MB para imágenes, PDF y Office; 500 KB para texto). La extracción se hace en el servidor.
- **Tests**: ocho tipos de pregunta. En práctica se corrige pregunta a pregunta en el servidor; en examen, todo al entregar.
- **PWA**: `public/sw.js` solo cachea `offline.html`, los iconos y `/_next/static/`; nada autenticado. Las versiones nuevas se activan cuando el usuario pulsa «Actualizar». Los iconos se generan con `node scripts/generate-icons.mjs`.
- **Tema**: claro, oscuro o sistema. Es la única preferencia guardada en el navegador.

## Seguridad y carga

`npm run test:security-db` necesita un PostgreSQL aislado. `npm run test:load-server` levanta el entorno sintético para k6 en localhost. Los detalles y las mediciones están en [docs/security/REPORT.md](docs/security/REPORT.md). CI (`.github/workflows/security-checks.yml`) comprueba sin desplegar nada.
