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

## Pendiente

- Repetir los 10 temas «solo tema» con la búsqueda mejorada.
- Bloques 1 (entrada), 3 (edición), 4 (exportar), 5 (ilustraciones FLUX), 6 (textos legales) y 7 (Dreams interactivos), cada uno en su PR.
