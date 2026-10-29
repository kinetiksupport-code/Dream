# Que Dream hable, explique y escriba de forma natural

Encargo de Carlos del 29/10/2026 («PROMPT COMPLETO: habla y escribe natural»).
Cinco entregas, una por PR. Este documento se va completando con cada una.

## P1 · Medición y diagnóstico (antes de tocar nada)

### Respuestas reales de producción (29/10/2026, últimos 30 días)

128 respuestas del chat. Solo números: `scripts/ia/medir-chat.sql` no
devuelve nunca el texto de un mensaje. dream-api no guarda qué modelo
respondió, así que la tabla junta Normal, Rápido y el respaldo.

| Medida | Antes |
|---|---:|
| Palabras por respuesta: media | 66 |
| Palabras: mediana | 28,5 |
| Palabras: percentil 90 | 178 |
| Respuestas de más de 120 palabras | **19,5 %** |
| Con lista numerada | 8,6 % |
| Con viñetas | 10,9 % |
| Con títulos | 2,3 % |
| Con negritas | 29,7 % |
| Con frases de robot | **15,6 %** (sobre todo «Aquí tienes»: 16 de 128; «¡Claro!»: 7; «¿Te queda claro?»: 4) |
| Con más de una pregunta | 15,6 % |
| Con caracteres chinos u otras escrituras | 0 |
| Legibilidad Fernández-Huerta: respuestas cortas / largas | 77,1 / 74,4 («fácil») |
| Palabras por frase: cortas / largas | 9,6 / 13,1 |
| Respuesta más larga | 435 palabras |

**Lectura.** Las palabras no son difíciles: la legibilidad sale «fácil». El
problema es el que vio Carlos: **una de cada cinco respuestas es un tocho**
(el 10 % más largo pasa de 178 palabras), con listas y frases de manual.

### Tokens por mensaje (logs `dream_call_usage` y `dream_prompt_breakdown`)

| Parte | Normal | Rápido |
|---|---:|---:|
| Prompt de sistema (real, Groq) | ≈ 4.900-5.500 | ≈ 1.700 |
| Historial | 0-550 | 0 |
| Salida real (`completion_tokens`) | 19-247 | 16 |
| Máximo de salida reservado (`max_tokens`) | 1.200 (2.048 con «apuntes/resumen») | 900 |

El prompt de sistema es el 90 % de cada mensaje. No cuenta en el límite del
alumno (`studentInputTokens`, IA-3), pero sí en el cupo de Groq.

### Por qué se alarga (el código)

| Dónde | Qué empuja a alargar |
|---|---|
| `NORMAL_STYLE` (prompts.mjs) | «normalmente menos de **250** palabras»: el tope real está al doble de lo que quiere Carlos |
| `THINK_STYLE` | «Máximo **350** palabras» |
| `SEARCH_ANSWER_STYLE` | «Normalmente menos de 250 palabras» |
| `FAST_STYLE` | «Máximo 120 palabras» y «Usa Markdown sencillo» (invita a negritas y listas) |
| `dynamicContextFor` | «Propón un ejercicio de práctica **al final** de las explicaciones»: añade un segundo bloque y una segunda pregunta |
| Botón «Explícamelo por pasos» (`components/message.tsx`) | Envía literalmente «Explícamelo por pasos.»: el modelo responde con «1. … 2. … 3. …» |
| `DREAM_SYSTEM_PROMPT` (de Carlos, no se toca) | 573 líneas, 76 palabras en MAYÚSCULAS, 37 líneas numeradas, 58 viñetas y 25 líneas de una sola palabra. El estilo del prompt se contagia a la respuesta (guía de Anthropic) |
| `max_tokens` | 1.200 en Normal cuando la salida real es de 19 a 247: no frena nada |
| No hay corte en el servidor | `AI_FLAGS.shortRetry` existe pero está **apagado**; nada impide un tocho |

**Hipótesis del encargo:**
- El prompt base pide respuestas completas: **en parte**. Pide «una unidad de
  comprensión», pero con formato de manual, y las capas de modo dejan 250-350 palabras.
- No hay tope con cifras: **confirmado**. Los únicos números son 250 y 350, y
  ningún límite duro.
- Qwen tiende a alargarse: **no se puede separar** sin medir con el modelo. Rápido
  (gpt-oss) también tiene respuestas largas.
- El estilo con listas y mayúsculas se contagia: **compatible con los datos**.
  El 30 % lleva negritas y el 19 % listas.

### Por qué el texto aparece de golpe

- **En el servidor:** con la búsqueda disponible (siempre en Rápido y Normal), la
  primera respuesta se **guarda entera** antes de enviarla (`provisional`, por
  si el modelo pide buscar). Llega al navegador de una vez.
- **En el navegador:** `lib/reveal.ts` la enseña palabra a palabra en
  **2 segundos como mucho** (Parte I). Una respuesta de 150 palabras sale a
  75 palabras por segundo: casi de golpe.

### Banco de pruebas

`evals/` con el mismo prompt que dream-api (ver `evals/README.md`):

- `tono.json` (21), `tutor.json` (12: sintagmas, fracción generatriz mixta,
  «todos los pasos» y un caso por asignatura principal) y `no-inventar.json`
  (21, con 0,4285714… → 3/7; 2,46 → 123/50; 1,2333… → 37/30).
- `conversacion.json`: dos conversaciones completas simuladas.
  - Un alumno que acierta cada paso: resultado final correcto, ningún turno con
    lista ni más de un paso, ningún paso repetido.
  - Otro que se equivoca en el paso 2.
- Comprobaciones nuevas (`evals/checks.mjs` y
  `supabase/functions/dream-api/reply-shape.mjs`, las mismas en el servidor):
  - frases de robot (27);
  - caracteres de otras escrituras;
  - procedimiento entero;
  - legibilidad Fernández-Huerta;
  - ortografía con **hunspell en español** (`nspell` + `dictionary-es`), en
    errores por cada 100 palabras (meta: menos de 1).
- El informe del banco da, por modelo:
  - palabras (media, mediana y percentil 90);
  - el % con listas, títulos, negritas, robot y procedimiento entero;
  - legibilidad, ortografía y tokens por caso.

### Lo que no he podido medir

- **El banco contra el modelo.** No hay clave de Groq en este entorno ni en
  los secretos de GitHub. Para ejecutarlo:
  `GROQ_API_KEY=… node evals/comparar-modelos.mjs --files tono,tutor,no-inventar,conversacion`.
  La medida de verdad es la de producción (tabla de arriba), que se repite tras
  cada entrega con `scripts/ia/medir-chat.sql`.
- **«% que dan la solución entera»** en producción: sin leer los mensajes no se
  sabe si eran deberes. En el banco sí se mide (`oneStep`, `mustNotMatch`).
- La prueba con alumnos reales: necesita el permiso de Carlos (ver §4 del
  encargo).
