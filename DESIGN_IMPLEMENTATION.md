# Implementación del diseño (Claude Design)

Fuente: canvas «Dream – Sistema de diseño y pantallas» (copia en `docs/design/claude-design/`, solo referencia).

## Mapa diseño → código

| Artboard | Ruta | Componente |
| --- | --- | --- |
| Inicio (escritorio/móvil) | `/chat` vacío | `components/chat-home.tsx` + `Composer variant="hero"` |
| Chat | `/chat?c=<id>` | `components/chat-experience.tsx`, `message.tsx`, `Composer variant="dock"` |
| Tareas | `/tasks` | `components/tasks-view.tsx` (datos: `lib/study-data.ts`) |
| Apuntes | `/notes` | `components/notes-view.tsx` (datos: `lib/study-data.ts`) |
| Exámenes | `/exams` y subrutas | `components/exams/*` (tokens nuevos en `exams.module.css`) |
| Historial | `/chat?view=recent` | `components/recents.tsx` (`lib/history.ts`) |
| Test | `/tests/[id]` | `components/test-experience.tsx` (pantalla completa, sin navegación) |
| Ajustes | `/settings` | `app/(dream)/settings/page.tsx` |
| Móvil · Más | `/more` | `app/(dream)/more/page.tsx` |
| Shell | todas | `components/shell.tsx`: sidebar 264 px (≥1024), barra de iconos (640–1023), tab bar de 88 px (<640) |
| Orb | — | `components/orb.tsx` (SVG del canvas; el núcleo pulsa 1,6 s mientras Dream trabaja) |

Tokens: `app/globals.css` (`:root`, `:root[data-theme="dark"]`, `prefers-color-scheme`, `prefers-contrast`), expuestos a Tailwind con `@theme inline`.

## Adaptaciones

- **Modo oscuro (derivado, pendiente de aprobación)**: fondo `#0B0E16`, superficie `#161A24`, texto `#F2F4F8` (17,6:1), secundario `#A3ADBF` (7,6:1 sobre superficie), borde `#2A3040`, primario de relleno `#155BFF` (texto blanco 5,3:1), primario como texto `#7AA2FF` (7,8:1), éxito `#6FD08C`, error `#FF8F84`.
- **Navegación activa**: el canvas usa texto `#155BFF` sobre `rgba(21,91,255,.10)`, que da 4,27:1 (no llega a AA). Se usa `#0E4FE0` (5,3:1) con el mismo fondo.
- **Tareas**: no hay endpoint de tareas. Se muestran las unidades de estudio de los exámenes (`exams` + `exam_get`). El estado es de solo lectura (completar una unidad tiene efectos en el backend). «Añadir tarea» queda oculto (`tasksSource.canCreate = false`). TODO documentado en `lib/study-data.ts`.
- **Apuntes**: son los materiales subidos a los exámenes. «Subir apuntes» / «Hacer foto» pasan el archivo en memoria al chat (`lib/pending-files.ts`), donde se sube con el flujo existente.
- **Ajustes**: sin «Respuesta directa» ni «Cómo te ayuda Dream». El nombre y el correo son los de la cuenta de Google de la sesión (`lib/account.ts`). «Eliminar mi cuenta» pide escribir ELIMINAR y llama a `account_delete`; si falla, muestra el error y un enlace de contacto.
- **Test**: radios nativos con `accent-color`, como en el canvas; el icono de acierto/error solo aparece tras corregir.
