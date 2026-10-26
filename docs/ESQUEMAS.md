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

Cabecera con materia, título redondeado (Nunito 900) y subtítulo entre líneas. Tarjetas pastel con borde del mismo tono, círculo numerado, subtarjetas, tabla de fechas con píldoras alternas, fórmula con KaTeX, «Ideas clave» con bombilla, «En resumen» a mano (Caveat) con subrayado, caja de cierre con flecha y el aviso «Contenido generado por IA, revísalo». Una columna en móvil (orden 1, 2, 3…) y tres desde 880 px; la última tarjeta de cada columna se estira para que acaben a la misma altura. Fuentes autoalojadas con `next/font`. Contraste AA de todos los tonos en claro y oscuro comprobado en `tests/esquemas.test.ts`.

Capturas del ejemplo de al-Ándalus: `docs/esquemas/`.

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

## Pendiente

- Ejecutar el banco con las claves reales de Groq y Tavily (no están en esta sesión).
- Comparar con la imagen de referencia de Carlos (`esquema-ejemplo-al-andalus.png`): no está en el repositorio.
- Bloques 1 (entrada), 3 (edición), 4 (exportar), 5 (ilustraciones FLUX), 6 (textos legales) y 7 (Dreams interactivos), cada uno en su PR.
