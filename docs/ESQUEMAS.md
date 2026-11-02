# Esquemas visuales

El alumno pide «hazme un esquema de X» o sube sus apuntes, y Dream devuelve un esquema visual con el texto siempre correcto, editable y exportable.

## Cómo se reparte el trabajo

| Quién | Qué hace | Dónde |
| --- | --- | --- |
| Qwen (Groq) | Solo el **contenido**, en JSON estricto: título, secciones, viñetas, fechas, ideas clave, resumen, cierre y una idea de ilustración por sección. | `SCHEME_PROMPT` y `schemeMessages` en `supabase/functions/dream-api/prompts.mjs` |
| Validador | Esquema, longitudes, sin HTML, español, fechas en orden, sin duplicados. **Toda cifra lleva una cita literal de la fuente** que contiene esa misma cifra; si no, ese dato se quita. Si hay errores graves, **un reintento** con la lista exacta. | `supabase/functions/dream-api/schemes.mjs` |
| Código de Dream | El **diseño**, de forma determinista: tono pastel por tarjeta (ciclo fijo), número, reparto en 3 columnas tipo masonry por altura estimada y qué tarjetas llevan ilustración (2–4). Qwen nunca escribe HTML ni CSS. | `lib/esquema.ts`, `components/esquema/` |
| FLUX (Cloudflare) | Las ilustraciones **sin texto** (Bloque 5, pendiente del OK de Carlos). Mientras tanto se dibuja un paisaje local en los tonos de la tarjeta. | — |

Motivo: un modelo de 27.000 M de parámetros no puede diseñar y escribir 400 palabras exactas a la vez, y ningún modelo de imagen gratis escribe bien ~400 palabras en español con tildes.

## Maqueta

Calcada del ejemplo de Carlos (`docs/esquemas/referencia-al-andalus.webp`; comparación lado a lado en `docs/esquemas/comparacion-al-andalus.png`):

- Franja lila con título grande (Baloo 2) y subtítulo a mano (Caveat) entre líneas.
- Tarjetas con fondo muy claro, borde y cabecera del mismo tono (amarillo, azul, rojo, índigo, celeste, naranja), círculo numerado y periodo entre paréntesis («(1031-1086)»).
- Subtarjetas en paralelo (verde y lila), introducción, tabla de fechas con píldoras de colores y separadores, fórmula con KaTeX.
- La caja de cierre («→ Fue una época…») va dentro de la primera tarjeta, junto a su ilustración.
- «Ideas clave» (verde, bombilla), «En resumen» (lila, libro, letra a mano, subrayado ondulado) y «Patrimonio/Legado» (celeste, icono, recuadro destacado) van en las columnas como una tarjeta más.
- Ilustraciones grandes al pie de la tarjeta, con pie de foto opcional.
- Reparto en 3 columnas desde 900 px: se prueban todas las combinaciones y gana la que deja las columnas más igualadas; la última tarjeta de cada columna se estira. Una columna en móvil, en orden.
- Fuentes autoalojadas con `next/font`. Contraste AA de todos los tonos en claro y oscuro comprobado en `tests/esquemas.test.ts`.
- Las cifras de los textos sin cita (título, periodos, introducciones, resumen…) tienen que estar en alguna viñeta o fecha con cita; si no, error y reintento.

Muestra local: `DREAM_STYLE_LAB=1 npx next start` y abrir `/esquema-muestra` (en producción da 404).

## Bloque 0 · Banco de pruebas (obligatorio antes de la interfaz)

```bash
GROQ_API_KEY=… TAVILY_API_KEY_1=… node scripts/esquemas/banco.mjs            # 10 temas × (apuntes, búsqueda) × (con, sin ejemplo)
DREAM_STYLE_LAB=1 npx next start -p 3111 &
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium node scripts/esquemas/capturas.mjs evals/esquemas/resultados/<fecha>
```

Mide por esquema: JSON válido a la primera, intentos, datos quitados por no tener cita, citas encontradas, faltas de tildes en palabras que siempre la llevan, tokens y tiempo; las capturas añaden los desbordes. El campo `manualWrongFacts` se rellena a mano comparando cada esquema con su fuente (`*.fuente.txt`).

Apuntes de ejemplo de los 10 temas: `evals/esquemas/apuntes/`. Opciones: `--model`, `--modes apuntes,busqueda`, `--topics`, `--example con|sin|ambos`, `--reasoning none|low|default`, `--strict`, `--temperature`.

**Criterio de paso: ≥ 9 de 10 sin datos inventados y visualmente al nivel del ejemplo.** Si Qwen no llega, se para y se avisa a Carlos con los resultados y las alternativas (otro modelo, más fuentes o plantillas con datos revisados). Nada se despliega sin su OK.

## Resultados del banco

`docs/esquemas/RESULTADOS-BANCO.md`: desde apuntes, 10/10 válidos y 0 datos erróneos (pasa el criterio); solo con el tema, falta repetir los 10 temas con la búsqueda mejorada.

## «Esquema de estos apuntes» (Bloque 1, en producción desde el 27/10/2026)

- **Chat:** con apuntes adjuntos, «hazme un esquema…» (`wantsScheme` en `lib/esquema.ts`) llama a `scheme_generate` en vez del chat. En la tarjeta del archivo hay un botón «Esquema de estos apuntes». Sin apuntes, la petición va al chat normal (el modo «solo tema» no pasó el banco: 8/10).
- **dream-api:** `scheme_generate` junta el texto de los adjuntos (máx. 10.000 caracteres, `schemeSourceFrom`), genera con el formato `json_schema`, valida y reintenta una vez (`generateScheme`), guarda en `dream_schemes` y responde con la tarjeta «Dreams» (`<!--DREAM_WIDGET:{"type":"scheme",…}-->`). Cuenta como un test en el cupo diario (`ADMISSION_OPERATION`). `scheme_get` lo devuelve solo a su dueño.
- **Datos:** `supabase/migrations/20261031090000_schemes.sql`. Solo el esquema validado, no los apuntes; RLS sin políticas y sin permisos para anon/authenticated; se borra con la cuenta.
- **Pantalla:** `/esquemas/[id]` con «Imprimir o guardar PDF».
- **Pruebas:** `tests/esquemas.test.ts`, `tests/browser/esquemas.spec.ts`.

## Pendiente

- Repetir los 10 temas «solo tema» con la búsqueda mejorada (mientras tanto, sin apuntes el chat los pide).
- Banco de pruebas de juegos con apuntes reales (clasificar y emparejar) antes de añadir más plantillas o dejar que Qwen escriba JS (Bloque 7: solo si supera el 90 % sin errores de lógica).
- Plantillas de juego que faltan: ordenar, rellenar huecos y arrastrar a una imagen.

## Ilustraciones (tanda 2) y textos legales

- `supabase/functions/dream-api/illustrations.mjs`: FLUX.2 [klein] 4B en Workers AI (`@cf/black-forest-labs/flux-2-klein-4b`, multipart `prompt`/`width`/`height`), 768×512. El prompt lo construye el servidor con un estilo fijo («sin texto, sin letras, sin caras realistas, apta para menores») a partir del `illustration_prompt` saneado (sin cifras ni comillas, temas sensibles fuera).
- Caché compartida por hash del prompt en el bucket público `scheme-illustrations` (sin datos personales). Cupos: 12 nuevas por alumno y día y 300 en total al día (~9.000 Neurons); las de caché no cuentan. Interruptor: `DREAM_ILLUSTRATIONS=off`.
- Si falta la clave, se agota el cupo o falla, se quedan los paisajes locales; el alumno ve «Hoy ya has usado tus ilustraciones; el esquema sigue funcionando sin ellas».
- Etiqueta «Imagen generada con IA» en cada imagen y «Contenido generado por IA, revísalo» en el esquema (AI Act, art. 50).
- Privacidad (`content/legal/privacidad.ts`): Cloudflare como proveedor de imágenes (solo la descripción corta en inglés), esquemas en la conservación y nota de transparencia. **Pendiente de revisar por Carlos:** región y conservación de Cloudflare para imágenes, y si hace falta subir `TERMS_VERSION`.

## Dreams interactivos (tanda 3)

- **Plantillas de Dream, contenido de Qwen.** `supabase/functions/dream-api/games.mjs` define el JSON de «clasificar» (categorías + elementos) y «emparejar» (concepto + definición). Cada elemento trae una cita literal de los apuntes; sin cita se quita y, si quedan pocos, se reintenta una vez con los errores y si no, `game_invalid`. La lógica está en `lib/dream-games.ts` (`gameDocument`).
- **Aislamiento.** `<iframe sandbox="allow-scripts">` sin `allow-same-origin` (origen opaco: sin cookies, almacenamiento ni acceso a Dream), `srcdoc` con CSP `default-src 'none'` (sin red). El contenido entra como JSON escapado y se pinta con `textContent`. Dream solo acepta `{tipo:'resultado', aciertos, total}` y `{tipo:'altura', alto}` de ese iframe, con forma exacta (`parseGameMessage`), y `game_result` lo vuelve a validar. Test con un juego malicioso en `tests/browser/dreams.spec.ts`.
- **Accesible.** Tocar/clic o arrastrar (pointer events, también táctil) y teclado (Tab + Intro), anuncios en `aria-live`, `prefers-reduced-motion`, modo oscuro.
- **dream-api:** `game_generate` (con apuntes; gasta como un test: `ADMISSION_OPERATION`), `game_get`, `game_result` (mejor y último resultado) y `dreams_list`. Tabla `dream_games` (migración `20261031120000_dream_games.sql`, solo service_role).
- **Chat:** «hazme un juego», «clasifica los sintagmas»… con apuntes crea la tarjeta «Dreams · Clasificar/Emparejar»; sin apuntes los pide sin gastar cupo. Mientras se crea un esquema o un juego el estado dice «Generando Dreams…».
- **Sección «Dreams»** (`/dreams`, en la barra lateral y en «Más»): esquemas y juegos con filtro por tipo.
- Aviso «Generado por IA a partir de tus apuntes. Revísalo» y párrafo en Privacidad.
