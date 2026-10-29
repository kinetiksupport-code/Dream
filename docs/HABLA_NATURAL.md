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

## P2 y P3 · Corto, paso a paso y bien escrito

### Qué cambia para el alumno

- **Nunca más un tocho.** dream-api corta la respuesta a **120 palabras** en la
  última frase completa (260 si pidió teoría, apuntes o un resumen) y añade
  **«¿Sigo?»**.
  - Si el alumno contesta «sí», «sigue», «vale» o «dale», recibe el siguiente
    trozo **sin llamar a la IA**: no gasta tokens ni cuenta en su límite.
  - Si lo ya enseñado acaba en una pregunta, el resto se tira: esa pregunta
    manda.
- **Un paso cada vez.** El prompt pide unas 80 palabras (50 con deberes), una
  sola idea y una sola pregunta al final.
  - Si pide «todos los pasos», Dream dice cuántos son sin numerarlos y explica
    solo el primero.
  - El botón «Explícamelo por pasos» pasa a ser «Explícamelo poco a poco» y
    ya no pide una lista.
- **Plan oculto.** Cuando enseña un procedimiento, la IA deja una marca que el
  alumno no ve: `<!--DREAM_PLAN:{tema, pasos, paso}-->`.
  - El servidor la quita, la valida (≤ 6 pasos, ≤ 100 tokens) y la guarda en la
    pizarra de la conversación.
  - En el turno siguiente vuelve como DATOS: «ya has explicado hasta el paso 2;
    sigue con el 3; no repitas pasos».
- **Solo español.** Si una respuesta guardada entera trae caracteres chinos u
  otras escrituras, se rehace una vez («rehazla solo en español»). Lo que quede
  y lo que llegue en streaming se quita. No se toca si el propio alumno escribió
  en esa escritura (clase de idiomas).
- **Tono reescrito** (`TONE_LAYER`, «CÓMO HABLAS Y ESCRIBES»):
  - prosa corta, en positivo y con el porqué de cada regla;
  - sin listas ni mayúsculas, porque el estilo del prompt se contagia;
  - conductas en vez de adjetivos: reacción corta, frases de menos de 20
    palabras, elogio del método y casi sin emojis;
  - redacción y ortografía: tildes, ¿ ¡, números a la española, sin muletillas
    y solo en español;
  - cuentas sencillas en texto (3/7, x²);
  - dos pares «mal → bien» con los casos reales de Carlos (fracción generatriz
    y sintagmas).
- **Contadores en producción** (`dream_reply_shape` en los logs, sin texto):
  palabras, listas, títulos, negritas, frases de robot, preguntas, caracteres
  quitados, si se cortó, si se guardó resto, si hubo plan y si se rehízo por el
  idioma.

### Qué se ha quitado del prompt (no es de Carlos)

| Antes | Ahora |
|---|---|
| Normal: «normalmente menos de 250 palabras» | Remite a «CÓMO HABLAS Y ESCRIBES» |
| Pensar más: «Máximo 350 palabras», lista 1-6, «Usa Markdown» | Prosa: «más cuidadosa, no más larga» |
| Rápido: «Máximo 120 palabras», viñetas, «Usa Markdown sencillo» | Prosa, unas 60 palabras |
| Búsqueda: «menos de 250 palabras», «Markdown sencillo» | 80-120 palabras, en prosa |
| Contexto: «Propón un ejercicio de práctica al final» | «Que tu pregunta final sea un mini ejercicio» |
| Política: «apuntes o resumen completo requieren respuesta completa» | Entera, pero en trozos de 120 palabras con «¿Sigo?» |

`DREAM_SYSTEM_PROMPT` **no se ha tocado**. El texto de
`system-prompt-dream-reglas-de-explicacion.md` (`EXPLAIN_RULES`) que cita el
encargo **no está en el repositorio ni en lo que me pasaste**. «CÓMO HABLAS Y
ESCRIBES» está escrito a partir del encargo y hace ese papel.

### Límites de salida (`max_tokens`)

| Modo | Antes | Ahora (conversación y deberes) | Teoría |
|---|---:|---:|---:|
| Rápido | 900 | 700 | 1.400 |
| Normal | 1.200 | 800 | 2.048 |
| Pensar más | 1.500 | 1.000 | 2.048 |
| Respuesta con búsqueda | 1.000 | 800 | 800 |

La salida real medida en Normal es de 19 a 247 tokens. El margen es para el
razonamiento oculto de Qwen, que también cuenta. El límite que manda es el de
palabras del servidor.

### Tokens por mensaje (tokenizador real, `scripts/ia/medir-tokens.py`)

| Prompt de sistema | Antes (Qwen3 / gpt-oss) | Ahora (Qwen3 / gpt-oss) |
|---|---:|---:|
| Normal, con herramienta | 4.718 / 4.035 | 5.137 / 4.407 |
| Rápido | 1.659 / 1.458 | 2.023 / 1.775 |
| Pensar más | 1.620 / 1.404 | 1.967 / 1.707 |
| Búsqueda: respuesta | 1.301 / 1.126 | 1.688 / 1.463 |
| Recordatorio antes del mensaje | – | ~30 |

**+419 tokens por mensaje en Normal (+9 %).** Es el coste de «CÓMO HABLAS Y
ESCRIBES»: 634 tokens frente a los 277 del tono anterior. Va en el prompt de
sistema, que **no cuenta en el límite del alumno** (IA-3), pero sí en el cupo de
Groq.

Lo compensan:
- respuestas más cortas, unos 40-120 tokens menos de salida en las largas;
- un historial más corto en los turnos siguientes;
- el «sí» a «¿Sigo?», que no llama a la IA.

La entrega 5 (P6) recorta lo que se ha quedado repetido.

### Otros enfoques (P3.6): qué he probado

Investigado en artículos y foros de tutores con IA y en las fichas de Qwen. Lo
que más se repite:
- un límite **con cifra** («unas 80 palabras») funciona; «sé breve», no;
- ejemplos con la longitud buena ayudan a calibrar;
- un `max_tokens` bajo corta a mitad de frase: no da forma, solo frena;
- Qwen3 pide temperatura 0,7 y top_p 0,8 sin razonamiento, y avisa de que
  `presence_penalty` alto **mezcla idiomas**.

| Enfoque | Estado | Coste en tokens | Medido |
|---|---|---:|---|
| Longitud con cifras y un paso (en vez de «extensión necesaria») | **Adoptado** | (incluido arriba) | Producción, tras desplegar |
| Corte del servidor a 120 palabras en frase completa + «¿Sigo?» | **Adoptado**: garantiza la longitud aunque el prompt falle | 0 (ahorra salida) | Pruebas: siempre ≤ 120 |
| Recordatorio de forma justo antes del mensaje del alumno (instrucción cerca del turno) | **Adoptado** | ~30 por mensaje | No (sin clave de Groq) |
| Lista de frases de robot más larga (27) en el escáner y los evals | **Adoptado** para medir. El prompt nombra solo 5, porque nombrar muchas las sugiere | 0 | Producción: `robot` en los logs |
| Pares «mal → bien» con los casos reales | **Adoptado** (2) | ~120 | No |
| Reglas de estilo al principio, al final o en ambos sitios | Al final (detrás del prompt de Carlos) + recordatorio por turno | – | No: comparar con `evals/comparar-modelos.mjs` |
| Segunda pasada barata que reescribe más corto (`AI_FLAGS.shortRetry`) | **No adoptado**: el corte hace lo mismo gratis y sin esperar otra llamada | +1 llamada | – |
| Temperatura 0,7 / top_p 0,8 (ficha de Qwen3) frente a 0,5 | **Sin cambiar**: sin evals no se sabe si mejora | 0 | No |
| `presence_penalty` | **No adoptado**: la ficha de Qwen avisa de que mezcla idiomas | 0 | – |
| Ejemplos dinámicos según el tipo de petición | Solo el recordatorio cambia según el tipo (charla, deberes o teoría) | ~30 | No |

**Regla del encargo:** si más del ~10 % de respuestas necesita corte o
reintento, hay que corregir el prompt. Se mira con
`scripts/ia/medir-chat.sql` (`pct_cortadas_con_sigo`) o en los logs
(`dream_reply_shape`: `cut`, `foreign_retry`).

### Lo que no he podido comprobar

- Cómo responde el modelo con el prompt nuevo: no hay clave de Groq. Las
  cifras de antes y después salen de producción (tabla de P1, repetir con
  `scripts/ia/medir-chat.sql` unos días después de desplegar).
- Si Qwen deja bien la marca del plan. Si no la deja, no pasa nada: no hay plan.
  Se ve en los logs (`plan: true`).
- Si con 800 tokens de salida el razonamiento oculto de Qwen deja sin respuesta
  algún ejercicio de matemáticas difícil. Se vigila con los errores «respondió
  sin texto» en los logs.
- Las fichas verificadas no entran hoy en el chat (solo en el panel). Por eso
  los pasos del plan los decide la IA.
