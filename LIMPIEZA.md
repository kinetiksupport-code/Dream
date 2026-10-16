# Limpieza de Dream (15/10/2026)

Rama `chore/limpieza-dream`, creada desde `feature/dream-ui-pwa` (d5d8321). Criterio: solo se borra lo que se ha demostrado que no se usa (búsqueda de referencias, `tsc`, `eslint`, `knip`, `depcheck`, tests). Lo dudoso se queda y aparece abajo como pregunta.

## 1. Inventario

| Archivo o carpeta | Por qué parece antiguo | Cómo lo comprobé | Decisión |
| --- | --- | --- | --- |
| `docs/design-reference/` (2,2 MB) | Exportaciones de Figma del diseño anterior (papel, sombras duras) | Solo la citaba `docs/README.md`; el diseño vigente es `docs/design/claude-design/` | **Borrado** |
| `docs/visual-qa/` (5,6 MB) | Capturas de la UI anterior | Solo la citaban `docs/README.md` y `OBSERVABILITY.md`; Playwright ya genera las capturas en `test-results/` | **Borrado** (enlaces actualizados) |
| `docs/design/exams/` (3,0 MB) | Figma del flujo de Exámenes | El canvas nuevo solo trae el índice de Exámenes; el asistente, el plan, el simulacro y los resultados siguen esa referencia | **Se queda** |
| `docs/design/claude-design/` | Copia del canvas actual | Es la fuente del diseño | **Se queda** |
| `docs/security/load-*.json`, `lease-query-before.txt`, `FILES.txt`, `K6_VERSION.txt` (≈ 60 KB) | Resultados de pruebas de carga | `REPORT.md` dice «JSON completos en `load-*.json`» y que los fallos se conservan a propósito; `scripts/security/load.k6.js` escribe ahí; `REPORT.md` cita `FILES.txt` y el EXPLAIN de leases | **Pregunta** (son la evidencia del informe) |
| `docs/security/AUDIT.md`, `OPERATIONS.md`, `REPORT.md` | — | Siguen describiendo la capa de admisión que existe en el código | **Se quedan** |
| `README.md` | Mezclaba observabilidad, exámenes y el contrato v3 original, con datos de una fecha concreta (Google desactivado el 7/10) | Lectura | **Reescrito** como README único, con enlaces al resto |
| `DESIGN_IMPLEMENTATION.md`, `EXAMS_IMPLEMENTATION.md`, `OBSERVABILITY.md`, `QA.md` | — | Vigentes | **Se quedan**, enlazados desde el README |
| «Cómo te ayuda Dream» (`pref_*`) en Ajustes | Carlos quiere quitarlo | Usos: Ajustes, `lib/types.ts`, `getDreamProfile`, la lista de acciones de analítica y los tests | **Borrado** en el cliente y en `dream-api` (desplegado). Columnas: migración pendiente, ver §3 |
| Filtro «profesor/alumno/role» en `errorMessage()` | Dream es solo para estudiantes | `resolveDreamMode()` siempre devuelve `role: 'student'`; el cliente no llama a ninguna acción docente | **Borrado** |
| Modo profesor en `dream-api` (`teacher_invite_*`, `teacher_dashboard`, `dream_teacher_*`, `onboarding`, `mode.mjs`) | Sobra | Ningún archivo del cliente lo usa | **Pregunta**: borrarlo exige desplegar y migrar (§3) |
| Mantenimiento: `lib/maintenance.ts` + `middleware.ts` + `/api/auth/verify-maintenance` + `/maintenance` | — | Es la única implementación en esta rama; `typecheck` y tests pasan | **Se queda** |
| Rama `qa/dream-maintenance-v2-2026-10-14` | Segunda implementación de mantenimiento | Parte de una base antigua: 2 commits propios, 40 por detrás; no está en esta rama | **Proponer cerrarla** (no borro ramas remotas) |
| `PrivacySettings` con `settings-group` / `settings-row` | Estilo antiguo | Era el único uso de esas clases | **Unificado** con `group` / `group-row`; CSS antiguo borrado |
| CSS sin uso en `app/globals.css` | `.settings-*`, `.avatar`, `--on-accent-secondary`, `--viewport-top` | Script: cada selector y cada variable se buscó en todo `app/` y `components/`. Los que salen por nombres dinámicos (`activity-*`, `composer-*`) o de librería (`lucide`) se quedan | **Borrado** (≈ 60 líneas) |
| `tests/browser/fixtures.ts` | Fixture que ningún spec importa | `knip` y búsqueda | **Borrado** |
| `lib/account.ts` (`accountActions` con TODO) | Placeholders `null` sin endpoint | Solo lo usaba Ajustes | **Sustituido** por `accountIdentity()` (nombre y correo de la sesión) |
| Tipos `DreamWidget`, `TestAnswer`, `LearningTopic`, `UserPreferences` | Sin referencias | `knip` y `tsc` | **Borrados** |
| Exports internos (`ACTIVITY_LABELS`, `TasksLayout`, `NotesLayout`) | Exportados sin uso externo | `knip` | **Ya no se exportan** |
| `@types/katex` | KaTeX solo se importa como CSS | Búsqueda de `from "katex"`: ningún resultado | **Quitado** de `package.json` |
| `@types/pg` | Tipos para `scripts/security/db.mjs` | `tsconfig` no comprueba `.mjs`, pero ayuda al editor | **Pregunta** |
| `eslint-config-next`, `tailwindcss`, `@tailwindcss/postcss` | depcheck / knip los marcan | Se cargan por nombre (`FlatCompat`, `postcss.config.mjs`, `@import "tailwindcss"`) | **Se quedan** (falsos positivos) |
| Fallback a `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `/api/auth/verify-maintenance` | Nombre de clave antiguo | No está en `.env.example`; quitarlo puede romper un entorno que solo tenga esa variable | **Pregunta** |
| `.env.example` | Le faltaban variables que el código lee | `MAINTENANCE_MODE` y `MAINTENANCE_COOKIE_SECRET` se leen en el servidor | **Añadidas, vacías** (solo documentación, no cambia ningún entorno) |
| `console.log` | — | Solo en `scripts/` (salida de herramientas de línea de comandos) | **Se quedan** |
| TODO | — | Queda uno en `lib/study-data.ts` (endpoints de tareas y apuntes), que sigue pendiente | **Se queda** |

Ahorro: ≈ 7,8 MB de `docs/` más código y CSS muerto.

## 2. Ramas y PR (no he borrado ni cerrado nada)

| Rama | PR | Estado | Propuesta |
| --- | --- | --- | --- |
| `feature/exams-persistent` | [#1](https://github.com/kinetiksupport-code/Dream/pull/1) → `main` | Borrador abierto | Base de la pila: fusionar en orden #1 → #2 → #3 → mantenimiento → #7 |
| `feature/privacy-observability` | [#2](https://github.com/kinetiksupport-code/Dream/pull/2) → #1 | Borrador abierto | Igual |
| `feature/security-reliability` | [#3](https://github.com/kinetiksupport-code/Dream/pull/3) → #2 | Borrador abierto | Igual |
| `fix/maintenance-mode` | sin PR | Base de #7 | Abrir PR contra #3 o fusionarla junto con #7 |
| `feature/dream-ui-pwa` | [#7](https://github.com/kinetiksupport-code/Dream/pull/7) → `fix/maintenance-mode` | Borrador abierto | Base de esta limpieza |
| `fix/lock-client-privileges` | [#4](https://github.com/kinetiksupport-code/Dream/pull/4) → #3 | Borrador abierto, 2 commits sin integrar | Revisar; si sigue haciendo falta, rebasar sobre la pila |
| `fix/revoke-client-direct-writes` | [#5](https://github.com/kinetiksupport-code/Dream/pull/5) → #3 | Borrador abierto, 1 commit sin integrar | Igual que #4 |
| `fix/admission-budget-accuracy` | [#6](https://github.com/kinetiksupport-code/Dream/pull/6) | Cerrado; sus commits ya están en la pila | Se puede borrar la rama |
| `feature/landing-login-examenes` | sin PR | Todo su contenido ya está en la pila (0 commits propios) | Se puede borrar |
| `qa/dream-maintenance-v2-2026-10-14` | sin PR | Implementación alternativa sobre una base antigua | Cerrar |
| `claude/friendly-sagan-ehl8ef` | sin PR | Igual que `main` (0 commits propios) | Se puede borrar |

## 3. Hecho con el permiso de Carlos y lo que queda

1. **`dream-api` desplegado desde este repo (versión 24).** Sustituye al stub v22 que respondía «El servicio está en recuperación». Ya no tiene preferencias `pref_*`, modo profesor, `onboarding` ni `mode.mjs`: Dream ayuda siempre paso a paso, propone práctica y usa un tono tranquilo.
   - Orígenes permitidos por defecto: `https://www.edudream.es`, `https://edudream.es`, `http://localhost:3000` y las previews `https://dream-*-kinetik1.vercel.app`. El secreto opcional `DREAM_ALLOWED_ORIGINS` (lista separada por comas) añade más. Comprobado: 204 para esos orígenes y 403 para uno ajeno.
   - Necesita los secretos de Groq y Tavily en Supabase. Si faltan, el chat responde «servicio de IA no configurado».
2. **`account_delete` (Eliminar mi cuenta) es real.** Pide `confirm: "ELIMINAR"`, borra las reservas de admisión y llama a `auth.admin.deleteUser`. Todas las tablas de Dream tienen FK a `auth.users` con `on delete cascade` (los eventos de IA quedan con `user_id` nulo). Si falla, el modal muestra el error y el enlace a `hellodream@edudream.es`.
3. **Migración `20261015170000_student_only_cleanup` (pendiente).** Borra las tablas de profesor y de dominios, `dream_classify_email` y las columnas de rol y `pref_*` de `dream_profiles`, y actualiza el trigger de alta. Conserva fecha de nacimiento, franja de edad y permiso del tutor: el registro con edad los necesita. Comprobado antes: 0 invitaciones, 0 vínculos, 0 perfiles que no sean de alumno, y nada más depende de eso.
   - **No se ha aplicado:** la herramienta de Supabase agotó el tiempo dos veces sin cambiar nada. La app funciona igual sin ella, porque el código nuevo ya no lee esas columnas. Para aplicarla: Supabase → SQL Editor → pegar el archivo, o `supabase db push`.
4. **Ramas sin borrar.** `fix/admission-budget-accuracy` y `feature/landing-login-examenes` ya están integradas; se pueden borrar cuando quieras.
5. **Datos de uso.** En Vercel → proyecto Dream → Settings → Environment Variables (Production y Preview), y después volver a desplegar:
   - `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` = token `phc_…` del proyecto PostHog.
   - `NEXT_PUBLIC_POSTHOG_HOST` = `https://us.i.posthog.com`.
   - `NEXT_PUBLIC_SENTRY_DSN` = DSN del proyecto Sentry (y, si quieres errores del servidor y sourcemaps, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` y `SENTRY_AUTH_TOKEN`).

   Comprobado en local: con las de PostHog, el interruptor se activa y envía solo eventos permitidos (test `observability.spec.ts`).
6. **El correo con `edugreen.es`.** No está en ninguna rama del repo. El correo de Ajustes sale de la sesión de Supabase; en el backend del repo, `profile.email` también es el correo del usuario autenticado, no un valor guardado. El stub desplegado devuelve `usuario@edudream.es`, que se parece mucho. Si viste otro dominio con el stub, era ese texto; si no, era el correo real de la cuenta de Google con la que entraste. Con este PR, Ajustes muestra el correo de la sesión aunque el backend devuelva otro.
7. Las dudas de la tabla: los resultados de carga en `docs/security`, `@types/pg` y el fallback `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
