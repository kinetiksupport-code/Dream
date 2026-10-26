# Bienvenida y consentimiento

**Estado (20/10/2026):**
- **Interfaz:** hecha y probada con el servidor simulado (PR «Bienvenida 1/4»).
- **Servidor:** escrito y probado (PR «Bienvenida 2/4»), pero **no aplicado ni desplegado**. Necesita el OK de Carlos.
- **Base de datos:** la migración antigua `20261017120000_ai_consent.sql` **ya está aplicada** en producción (registrada como `20261019141145 ai_consent`). Por eso existen ya `ai_consent_at` y `dream_private.consent_events`.

Decisiones de Carlos que se aplican:
- **18/10:** edad mínima de 14 años, sin casilla del tutor.
- **20/10:** bienvenida con nombre, aficiones, apodo, edad y aviso de IA.

## Qué ve el alumno

1. Entra con Google.
2. Si el servidor dice que la bienvenida no está hecha, Dream la enseña a pantalla completa (`components/welcome/welcome-flow.tsx`):
   1. **Hola.**
   2. **Nombre:** el de Google, editable.
   3. **Aficiones:** hasta 8.
   4. **Apodo:** cómo quiere que le llame la IA.
   5. **Fecha de nacimiento:** con ruedas.
   6. **«Vas a hablar con una IA»:** dos casillas sin marcar.
   7. **«¡Listo, {apodo}!».**
3. Mientras no la termina, tapa toda la app, también Ajustes. Solo se puede «Salir».
4. Cada paso se guarda en el servidor. Al recargar, vuelve al mismo paso. La fecha de nacimiento no se guarda hasta el consentimiento.
5. **Menores de 14:** «Dream es para mayores de 14 años. ¡Te esperamos!». El servidor borra nombre, apodo y aficiones y no guarda la fecha. Después se cierra la sesión.
6. **Las dos casillas** (los textos están en `lib/consent.ts`, y el servidor guarda una copia idéntica en `onboarding.mjs`, comprobada por una prueba):
   - «Estoy de acuerdo en enviar mi información a proveedores de IA para que Dream pueda responderme».
   - «He leído y acepto los Términos y la Política de privacidad». Los enlaces se abren en otra pestaña.
7. **En Ajustes:**
   - **Perfil:** cambiar nombre, apodo y aficiones.
   - **Privacidad:** retirar el permiso de IA, con confirmación. Después, la app pide solo el paso de IA, y Ajustes sigue abierto para salir o borrar datos.
8. **Términos nuevos:** si cambian, se sube `TERMS_VERSION` en `lib/consent.ts` y en `onboarding.mjs`, y todos vuelven a ver el paso de IA.

Con el `dream-api` de hoy no se ve nada nuevo. La web solo activa la bienvenida cuando el perfil trae `ai_consent_at`, y el servidor solo manda los campos nuevos cuando existe la columna `terms_version`.

## Base de datos

Migración propuesta: `supabase/migrations/20261020120000_welcome_profile.sql` (**no aplicada**).

**Columnas nuevas en `dream_profiles`:**

| Columna | Tipo | Regla |
|---|---|---|
| `terms_accepted_at` | `timestamptz` | Cuándo marcó la casilla de Términos |
| `terms_version` | `text` | Versión aceptada |
| `nickname` | `text` | 1–20 caracteres o `null` |
| `interests` | `text[]` | Hasta 8 elementos de 1–30 caracteres (`dream_private.valid_interests`) |
| `onboarding_step` | `smallint` | 0–6 |

**Se reutilizan:** `birth_date`, `age_band`, `onboarding_completed` y `ai_consent_at`. Las columnas del tutor se quedan, pero ya no se usan.

**`dream_private.consent_events`:** acepta también `kind = 'terms'` y una columna `terms_version`.

**Alumnos actuales:** la migración pone `onboarding_completed = false` a quien no tenga `ai_consent_at`. Hoy son los 10 perfiles, y todos tienen `true` por la acción `onboarding` antigua. Así todos ven la bienvenida completa una vez. Si Carlos prefiere que solo vean el paso de IA, se quita ese `update`.

**Permisos:**
- **Lectura:** cada alumno solo lee su fila (`dream_profiles_select_own`).
- **Escritura:** `authenticated` solo puede actualizar `display_name`, `avatar_url` y `academic_level`. Las columnas nuevas solo las escribe `dream-api`, con `service_role`.

## `dream-api`

Toda la lógica pura está en `supabase/functions/dream-api/onboarding.mjs`. Sus pruebas están en `tests/onboarding-server.test.ts`.

### `profile`

Añade `ai_consent_at`, `terms_accepted_at`, `terms_version`, `age_band`, `nickname`, `interests`, `onboarding_completed` y `onboarding_step`. **Nunca** devuelve `birth_date`.

### `onboarding_save`

Petición: `{ step?, display_name?, nickname?, interests? }`. Valida cada campo:
- **Nombre:** de 1 a 40 caracteres.
- **Apodo:** hasta 20 caracteres.
- **Aficiones:** hasta 8, de hasta 30 caracteres, sin repetidas.
- **Paso:** de 0 a 4.

Cualquier otro campo se ignora. Sin `step` es una edición desde Ajustes.

### `onboarding_age`

Petición: `{ birth_date }`. Calcula la edad en el servidor, con la fecha de Madrid.
- **Menos de 14:** borra nombre, apodo, aficiones, paso, fecha y franja, y responde `{ allowed: false }`.
- **14 o más:** responde `{ allowed: true }` y no guarda nada todavía.

### `consent`

Petición: `{ birth_date?, ai_consent: true, terms_accepted: true, terms_version }`.
- **Edad:** manda la fecha ya guardada, si existe, para que no se pueda cambiar y saltarse la edad. Si no hay ninguna, usa la que llega.
- **Rechazos:**
  - menor de 14: 403 `under_age`, y se borra lo guardado;
  - falta la casilla de IA: `ai_consent_required`;
  - falta la de Términos: `terms_required`;
  - versión antigua de los Términos: 409 `terms_outdated`.
- **Si todo está bien:** guarda `birth_date`, `age_band`, `ai_consent_at`, `terms_accepted_at`, `terms_version`, `onboarding_completed = true` y `onboarding_step = 6`.
- **Historial:** añade una fila en `consent_events` por casilla, con el texto exacto mostrado. Sirve para demostrar el consentimiento (RGPD art. 7.1).

### `consent_withdraw`

Petición: `{ kind: "ai" }`. Pone `ai_consent_at = null` y añade una fila `granted = false`. Los datos se conservan.

### Bloqueo real

Antes de la admisión (para no gastar cupo), se rechazan con 403 `consent_required`:
- todas las acciones de `consumingActions` (chat, adjuntos, tests y exámenes con IA);
- `conversation_create`, `exam_create`, `exam_upload_start`, `exam_material_add` y `upload_session_create`.

Se rechazan si falta `ai_consent_at` o `terms_accepted_at`, o si `terms_version` no es la vigente.

**Siguen abiertas:** ver y borrar conversaciones, exámenes y cuenta, y `profile`.

**Sin la migración, el bloqueo está apagado:** si el perfil no tiene `terms_version`, no bloquea. Así el código puede desplegarse antes que la migración sin dejar a nadie sin chat.

**En la web:** cuando llega `consent_required`, el perfil se vuelve a pedir y aparece el paso de IA (`dream:consent-required` en `lib/dream-api.ts` y `components/providers.tsx`).

## Personalización sin datos que identifiquen

- **El apodo nunca va al proveedor de IA.**
  1. El prompt de sistema pide a la IA que escriba `{{APODO}}` cuando se dirija al alumno.
  2. La respuesta se guarda con el marcador, y así vuelve a la IA en el historial.
  3. Al alumno le llega ya con su apodo, o con su primer nombre si no eligió apodo. Durante el streaming, `createNicknameReplacer` guarda el final de cada trozo que podría ser un marcador partido («{{AP»). La acción `messages` hace lo mismo al leer.
- **Las aficiones sí se envían:** «Le gusta: fútbol, música. Úsalo solo si ayuda a poner un ejemplo», sin nombre ni correo.
  - **Cuándo:** solo en turnos que explican algo nuevo (habilidad `EXPLICAR` con ritmo `foundation`, `reframe` u `overview`).
  - **Coste:** unos 30 tokens, y solo en esos turnos.
  - **Dónde:** van en el contexto dinámico, no en cada mensaje del historial.
- **El nombre, el correo y el identificador del alumno no se envían nunca.**

## Orden de despliegue (propuesto, cada paso con el OK de Carlos)

1. **Desplegar `dream-api`.** Sin la migración no cambia nada: no hay `terms_version`, así que no hay campos nuevos ni bloqueo.
2. **Desplegar la web** (PR 1/4 y 2/4). Tampoco cambia nada: la bienvenida espera a que el perfil traiga los campos.
3. **Aplicar la migración.** Desde ese momento, todos los alumnos ven la bienvenida y la IA queda bloqueada hasta que la acepten.

Así nadie ve una pantalla que no puede guardar, y el bloqueo solo empieza cuando todo lo necesario está en producción.

## Aviso de IA (art. 50)

Frase fija junto a la caja del chat, desde el primer mensaje y también en móvil: «Estás hablando con una IA. Puede equivocarse: contrasta lo importante.» (`AI_NOTICE`). Prueba: `tests/browser/login-registro.spec.ts › the AI notice is fixed…`.

## Pruebas

- **`tests/consent.test.ts`:** edad, fechas imposibles, cuándo se activa la bienvenida o solo el paso de IA, y las casillas.
- **`tests/onboarding.test.ts`:** límites, aficiones, apodo, reanudar y ruedas.
- **`tests/onboarding-server.test.ts`:**
  - validación en el servidor y menores de 14;
  - la fecha guardada no se puede cambiar;
  - el bloqueo y que funcione con el esquema antiguo;
  - que nunca se devuelva `birth_date`;
  - el marcador partido y que los textos sean idénticos a los de la web.
- **`tests/browser/login-registro.spec.ts`:** el flujo completo con el servidor simulado.
