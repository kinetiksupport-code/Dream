# Consentimiento al registrarse (Parte D)

**Estado (17/10/2026):** la interfaz está hecha y probada con mocks. El servidor está **solo diseñado**. Nada de esto está desplegado ni aplicado.

## Qué ve el alumno

1. Entra con Google.
2. Si el servidor dice que falta el consentimiento, Dream enseña la pantalla **«Antes de empezar»** (`components/welcome-consent.tsx`). Sustituye a chat, apuntes, exámenes, tareas e historial. Ajustes sigue abierto para poder salir o borrar datos.
3. Pide la **fecha de nacimiento**. Explica para qué: «Sirve para saber si necesitas el permiso de tu familia. No la usamos para nada más.»
4. Casillas separadas y **sin marcar**:
   - Solo si la edad es **menor de 14**: «Mi padre, madre o tutor legal me ha dado permiso para usar Dream y acepta la Política de privacidad y los Términos y condiciones».
   - Para todos: «Estoy de acuerdo en enviar mi información a proveedores de IA para que Dream pueda responderme».
5. Debajo, enlaces a `/terminos` y `/privacidad` (se abren en otra pestaña para no perder lo escrito).
6. «Empezar» no deja continuar si falta algo: error junto al campo, con la causa, y el foco salta al primero.

Los textos están en `lib/consent.ts` y salen tal cual de la Política de privacidad (§6 y §7) y de los Términos (§2).

## Qué hace hoy el servidor

- `dream-api` ya **no tiene** la acción `onboarding` (se quitó en la limpieza de alumnos, commit `7a33ca1`). Antes calculaba `age_band` y ponía `guardian_required = true` a los menores de 14, pero **nunca guardaba la casilla del tutor** ni bloqueaba nada.
- La tabla `dream_profiles` conserva `birth_date`, `age_band`, `guardian_required`, `guardian_confirmed_at` y `onboarding_completed` (migración `20261015170000`).
- La acción `profile` solo devuelve `email`, `display_name` y `academic_level`.

**Consecuencia:** con el servidor de hoy, la pantalla de bienvenida **no se muestra** (`needsConsent` devuelve `false` si el perfil no trae `ai_consent_at`). Así no se bloquea a nadie con una pantalla que no puede guardarse. En cuanto `dream-api` devuelva los campos, la pantalla se activa sola.

## Diseño del servidor (pendiente del OK de Carlos)

### 1. Base de datos

Migración propuesta: `supabase/migrations/20261017120000_ai_consent.sql` (**no aplicada**).

- `dream_profiles.ai_consent_at timestamptz`: cuándo marcó la casilla de IA. `null` = sin permiso o retirado.
- `dream_profiles.guardian_confirmed_at` (ya existe): cuándo marcó la casilla del tutor un menor de 14.
- `dream_private.consent_events`: historial de cada marca o retirada con el texto exacto mostrado. Sirve para demostrar el consentimiento (RGPD art. 7.1). Solo lo lee y escribe `service_role`.
- El navegador no puede escribir estas columnas: desde `20261008192123_security_admission`, `authenticated` solo puede actualizar `display_name`, `avatar_url` y `academic_level`.

### 2. `dream-api`: acción `profile`

Añade al perfil público:

```json
{
  "age_band": "under_14 | 14_17 | 18_plus | null",
  "guardian_required": true,
  "guardian_confirmed_at": "2026-10-17T10:00:00Z | null",
  "ai_consent_at": "2026-10-17T10:00:00Z | null"
}
```

No devuelve `birth_date`: el cliente no la necesita.

### 3. `dream-api`: acción nueva `consent`

Petición (es lo que ya envía `saveConsent` en `lib/dream-api.ts`):

```json
{ "action": "consent", "birth_date": "2012-05-01", "guardian_confirmed": true, "ai_consent": true }
```

Pasos:
1. Valida la fecha (`YYYY-MM-DD`, real, no futura, desde 1900). Si no: 400 «Indica una fecha de nacimiento válida.»
2. Calcula la edad **en el servidor** (manda el servidor, no el cliente) y la franja.
3. Si ya había `birth_date`, no la cambia (evita bajar o subir la edad para saltarse el tutor). Cambiarla sería por correo.
4. Si la franja es `under_14` y `guardian_confirmed` no es `true`: 400 con `code: "guardian_required"`.
5. Si `ai_consent` no es `true`: 400 con `code: "ai_consent_required"`.
6. Guarda `birth_date`, `age_band`, `guardian_required`, `guardian_confirmed_at = now()` (solo menores), `ai_consent_at = now()` y `onboarding_completed = true`.
7. Inserta una fila por casilla en `dream_private.consent_events` con el texto mostrado.
8. Responde `{ "profile": <perfil público> }`. El cliente vuelve a pedir `profile` y la pantalla desaparece.

### 4. `dream-api`: rechazar las acciones de IA

Antes de `admission.admit` (para no gastar cupo), si la acción está en `consumingActions` (`chat`, `attachment_upload`, `test_generate`, `test_check_answer`, `test_submit`, `exam_prepare`, `exam_session_create`, `exam_session_submit`) **o** envía contenido a Groq o Tavily (revisar `exam_material_add`, que puede leer imágenes con IA):

- Si `ai_consent_at` es `null` → 403 `{ "error": "Para usar el chat, acepta enviar tu información a los proveedores de IA.", "code": "consent_required" }`.
- Si `guardian_required` y `guardian_confirmed_at` es `null` → 403 con el mismo código.

Las acciones sin IA siguen funcionando: `profile`, `conversations`, `messages`, `conversations_delete_all`, `account_delete`, `exams`, `exam_get`. Así el alumno puede ver o borrar sus datos sin dar el permiso.

**Cliente (pendiente):** al recibir `code: "consent_required"`, `providers.tsx` debería volver a pedir `profile` para que aparezca la pantalla. Hoy no lo hace: no he querido programar contra una respuesta que el servidor aún no da.

### 5. Retirar el permiso en Ajustes

- Fila nueva en Ajustes › Privacidad: «Enviar mi información a proveedores de IA», con estado «Activado» y botón «Retirar».
- Confirmación: «Sin este permiso no podrás usar el chat, los apuntes ni los exámenes. Tus datos se conservan hasta que los borres.» Botones «Retirar permiso» y «Cancelar».
- Acción nueva `consent_withdraw` `{ kind: "ai" }`: pone `ai_consent_at = null` y añade una fila `granted = false` en `consent_events`.
- Después, la cuenta queda **sin chat**: el servidor rechaza las acciones de IA (punto 4) y el cliente vuelve a enseñar «Antes de empezar» al abrir chat, apuntes o exámenes. Ajustes sigue abierto.
- Un tutor que quiera retirar su permiso escribe a hellodream@edudream.es (lo dice la Política §7).

### 6. Orden de despliegue

1. Aplicar la migración (OK de Carlos).
2. Desplegar `dream-api` con `consent`, la puerta del punto 4 y `profile` con los campos nuevos (OK de Carlos).
3. Desplegar la web (este PR). Funciona en cualquier orden: sin los campos, no bloquea; con ellos, pide el consentimiento.

Todos los alumnos actuales verán «Antes de empezar» una vez, porque nadie tiene aún `ai_consent_at`.

## Aviso de IA (art. 50)

Frase fija y discreta junto a la caja del chat, desde el primer mensaje y también en móvil: «Estás hablando con una IA. Puede equivocarse: contrasta lo importante.» Mismo diseño que el PR #12 (`.ai-notice`).

## Pruebas

- `tests/consent.test.ts`: edad, fechas imposibles, validación y cuándo se activa la puerta.
- `tests/browser/login-registro.spec.ts`: casillas sin marcar, no deja continuar, foco al primer error con su causa, menor de 14 ve la casilla del tutor y mayor no, guardado (con mock), fallo al guardar, enlaces, 44 px y movimiento reducido.
