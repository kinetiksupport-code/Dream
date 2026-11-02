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

## P5 · El texto aparece escribiéndose poco a poco

Sustituye al «revelado suave» de la Parte I, que enseñaba la respuesta en
**2 segundos como mucho**.

### Qué hay hoy (antes de este cambio)

- El navegador ya revelaba **palabra a palabra**:
  - con `requestAnimationFrame` y sin `setState` por palabra;
  - solo cambia una clase en cada `<span data-w>`, y el árbol Markdown es el
    final desde el primer pintado;
  - un toque o un clic lo completa;
  - con movimiento reducido sale entero;
  - el historial no se anima;
  - las acciones esperan al final.
- **El ritmo** era «lo que haya en 2 s»: 150 palabras salían a 75 palabras por
  segundo, casi de golpe.
- El servidor manda la respuesta casi siempre entera (ver P1), así que todo el
  efecto depende del navegador.

### Qué cambia

- **Ritmo de escritura** (`lib/typing.ts`, un solo archivo):
  - **40 caracteres por segundo**, unas 7 palabras por segundo;
  - **pausas variables** de 150-250 ms tras punto, interrogación, exclamación o
    puntos suspensivos, y de 60-100 ms tras coma, punto y coma o dos puntos;
  - una variación fija de ±15 % por palabra, para que no suene a máquina;
  - **tope de 8 s**: una respuesta larga acelera para acabar a tiempo;
  - si la cola se acumula mientras sigue llegando texto, acelera poco a poco
    (como mucho ×2,5); si se vacía, espera.
  - Para que Carlos pida «más lento» o «más rápido», se cambia `charsPerSecond`
    o `maxTotalMs`.
- **Primer carácter al instante.** La primera palabra sale en el primer
  fotograma tras llegar los datos (medido: menos de 1 s).
- **«Dream está escribiendo…»** con tres puntos animados (solo `opacity` y
  `transform`) hasta el primer carácter.
  - Sale a los 400 ms, para no parpadear en una respuesta rápida.
  - El cursor parpadeante sigue durante la escritura y se va al terminar.
  - Mientras busca en internet o prepara un test, se mantiene su propia línea
    («Buscando en internet…»).
- **Controles:**
  - un toque, un clic, **Esc** o **Intro** (fuera del cuadro de escribir, donde
    Intro envía) enseñan todo al instante;
  - con la pestaña en segundo plano no se anima: al volver está completo.
- **Accesibilidad:**
  - el cuerpo de la respuesta es `aria-live="off"` mientras se escribe;
  - un anunciador oculto (`role="status"`, `aria-atomic`) lee la respuesta
    **una sola vez al terminar**, en texto plano, y la retira a los 6 s para
    que no se lea dos veces al recorrer el hilo;
  - con `prefers-reduced-motion` la respuesta sale entera y los puntos no se
    mueven.
- **Sin Markdown a medias:**
  - las fórmulas ya esperaban a estar completas;
  - ahora también un enlace sin cerrar («[texto](https://…») y una negrita sin
    cerrar.
- El «¿Sigo?» del corte (P2) se escribe con el mismo ritmo: es parte del texto.

### Reglas de las skills aplicadas

| Skill | Regla | Dónde |
|---|---|---|
| emil-design-eng | «Only animate transform and opacity» | Palabras (opacity 160 ms), puntos (opacity + translateY) |
| emil-design-eng | «Never animate keyboard-initiated actions» | Esc o Intro terminan al instante, sin transición |
| emil-design-eng | Reduced motion: «fewer and gentler animations, not zero» | Puntos quietos, cursor fijo y texto entero; se quedan los fundidos |
| emil-design-eng | Evitar parpadeos en esperas cortas | Indicador a los 400 ms |
| emil-design-eng | «Handle edge cases invisibly. Pause … when the tab is hidden» | Pestaña oculta: la respuesta se termina |
| apple-design | `motion.md › Let people cancel motion`: «don’t make people wait for an animation to complete» | Toque, clic, Esc o Intro |
| apple-design | `accessibility.md`: con Reduce Motion, reducir las animaciones automáticas y repetitivas | Movimiento reducido: sin escritura ni puntos animados |
| apple-design | `motion.md`: «avoid adding motion to UI interactions that occur frequently» | El historial y las respuestas ya completas nunca se animan |

### Medidas (Playwright, `tests/browser/revelado.spec.ts`, 29/10/2026)

| Medida | Antes (2 s) | Ahora |
|---|---:|---:|
| Respuesta corta, 203 caracteres (~40 palabras) | ≈ 0,5 s | **5,9 s** |
| Respuesta larga, ~170 palabras | 2 s | **8,1 s** (tope) |
| Primer carácter tras recibir los datos | 1 fotograma | 1 fotograma (< 1 s) |
| `requestAnimationFrame` en el segundo siguiente a terminar | – | **0** (no gasta CPU) |
| Fotogramas largos (> 50 ms) con CPU ×4 mientras escribe | ≤ 8 | 1 (74 ms) |

Capturas en móvil (390 px) y escritorio (1280 px), claro y oscuro, mientras
escribe y al terminar; indicador «escribiendo» y movimiento reducido:
`docs/diseno/escritura/`. Vídeos cortos en `docs/diseno/escritura/video/`.

**Fórmulas** (duda «texto o LaTeX»): `tests/browser/formulas.spec.ts` pasa en
móvil y escritorio.
- Cada fracción, raíz, potencia y subíndice sale una vez y bien maquetado.
- Al copiar sale `246/100`, `√2` o `x^2`.
- El renderizador está arreglado desde IA-1. Aun así, el prompt pide texto
  sencillo para las cuentas cortas (3/7, x²) y LaTeX solo cuando haga falta: en
  un chat se lee mejor.

**Honestidad:** esto mejora la sensación, **no reduce el gasto de tokens**.
El coste está en generar la respuesta, y llega igual de rápido de Groq. Para
ahorrar de verdad, ver P2 (corte y «¿Sigo?») y P6.

### Lo que no se hace (aún)

- **Respuesta en 2-3 burbujas** (punto 8, opcional): no está implementada. El
  encargo pide que Carlos la vea antes en una vista previa; se puede hacer
  detrás de un interruptor apagado cuando lo pida.

## P4 · Explicar simple, con sus gustos, y no inventar

### Qué cambia para el alumno

- **Ejemplo antes que definición.** «CÓMO HABLAS Y ESCRIBES» pide primero un
  ejemplo y, si hace falta, la definición en una frase, con la prueba del
  pasillo: «¿lo diría así un profe en el pasillo?».
- **Ejemplos con sus gustos, rotando.**
  - En los turnos que explican algo nuevo, el bloque de perfil trae una afición
    distinta en cada mensaje: «Ejemplo de hoy, si encaja: videojuegos».
  - Se usa sin decir «sé que te gusta…» y sin inventar datos reales
    (resultados, cifras); si no encaja, un ejemplo cotidiano.
- **«Cómo estudias»** (Ajustes › Perfil, todo opcional y de listas cerradas):
  - curso, hasta 4 asignaturas que le cuestan, objetivo, cómo prefiere que le
    expliquen, cuánto estudia al día y comunidad autónoma (por el temario);
  - las mismas listas en el servidor y en la app; dream-api rechaza cualquier
    otro valor, así que nunca entra texto libre en el prompt.
  - Columna nueva `dream_profiles.study_profile`, migración
    `20261101090000_study_profile.sql`. Solo la escribe dream-api: el alumno no
    tiene permiso de UPDATE sobre ella.
- **Bloque de perfil ≤ 180 tokens.** El peor caso (5 aficiones, curso, examen,
  4 asignaturas, objetivo, estilo, tiempo y comunidad) mide **175 tokens** con
  el tokenizador de Qwen3. El apodo sigue yendo como `{{APODO}}`.
- **No inventar** (búsqueda con Tavily, comprobado en su documentación):
  - `include_domains` con `include_domains_mode: "prefer"` (fuentes educativas
    y oficiales delante, sin dejar de buscar en el resto de la web);
  - `exclude_domains` con webs de deberes resueltos;
  - `search_depth: "basic"` y 3 resultados;
  - la consulta, limpia de datos del alumno como antes;
  - **caché de 24 h por consulta**, en la memoria de la función: una misma
    pregunta no gasta otra búsqueda mientras la función está caliente.
  - Si no lo encuentra con claridad, dice «no lo sé con seguridad». Lo
    encontrado se reescribe con sus palabras, sin copiar ni imitar el estilo de
    enciclopedia.
- **Privacidad:** la política nombra «Cómo estudias (opcional)», qué se envía a
  la IA y cómo cambiarlo o borrarlo.

### Lista de fuentes (para que la revise Carlos)

`supabase/functions/dream-api/tavily.mjs`:

- **Preferidas:** rae.es, fundeu.es, cervantes.es, cervantesvirtual.com,
  khanacademy.org, educacionyfp.gob.es, intef.es, boe.es, ine.es, csic.es,
  agenciasinc.es, es.wikipedia.org, britannica.com, museodelprado.es, nasa.gov,
  esa.int e iupac.org.
- **Excluidas:** brainly (.com, .lat, .in), quizlet, coursehero, chegg,
  studocu, slader, mathway, symbolab, photomath, rincondelvago, buenastareas,
  clubensayos, monografias, gauthmath y solvely.

El documento largo (Bloque 2 bis) no trae una lista: esta es una propuesta.

### Tokens

| | Antes de P4 | Ahora |
|---|---:|---:|
| `TONE_LAYER` (Qwen3) | 634 | 683 (+49: ejemplo antes que definición) |
| Bloque de perfil, peor caso | ~118 | 175 (≤ 180) |
| Sistema Normal con herramienta | 5.137 | 5.187 |

### Lo que no he podido comprobar

- **Que los ejemplos con gustos no empeoren la corrección:** hace falta el
  banco con clave de Groq (`evals/`).
- **La caché entre instancias:** vive en la memoria de cada instancia de la
  función. Una caché compartida necesitaría una tabla.
- **Las fichas verificadas** no entran todavía en el chat; las citas
  comprobadas y la comprobación numérica siguen detrás de sus interruptores
  (`AI_FLAGS.claimCheck` y `mathCheck`, apagados).

## P6 · Que el límite dure más

### De qué se compone cada mensaje (medido, 29/10/2026)

| Parte | Normal (tokens reales, logs de Groq) | ¿Cuenta en el límite del alumno? |
|---|---:|---|
| Prompt de sistema | 4.900-5.500 | **No** (desde IA-3) |
| Historial | 0-550 | 25 % |
| Apuntes del alumno | 0 en los mensajes medidos | 25 % |
| Imágenes | No se reenvían: el texto se extrae una vez al subir | – |
| Su mensaje | 1-35 | Sí |
| Salida (con el razonamiento oculto) | 19-247 | Sí |

**Por qué «se agota en 7-15 mensajes».** Antes de IA-3 cada mensaje de
Normal cargaba al alumno **~4.400 tokens** (mediana de
`dream_private.ai_usage_attempts`, 20-26 de octubre). Con 60.000 por ventana
salen **13-14 mensajes**: justo lo que vio Carlos.

Con la cuenta de IA-3 (ya en producción) un mensaje carga:
- su texto;
- el 25 % del historial y de los apuntes;
- la salida real.

Eso son unos **200-700 tokens**. Desde el 27/10 no hay cargos de alumnos
normales que medir: los chats de estos días son de cuentas de Fundación Loyola,
que no tienen límite. Hay que mirarlo con la consulta de abajo cuando chateen
alumnos normales.

### Qué se aplica en esta entrega

| Medida | Ahorro | Estado |
|---|---|---|
| Política de conversación sin repetir longitud, pasos ni tono (que ya están en «CÓMO HABLAS Y ESCRIBES») | −106 tokens de sistema por mensaje | **Adoptada** |
| Contexto del alumno sin «un paso por mensaje» ni «tono sobrio» (repetidos) | −34 | **Adoptada** |
| Respuestas cortas: corte a 120 palabras y salida máxima 800 (P2) | Salida del alumno: unos −40 % en las respuestas largas; reserva por mensaje de 1.200 a 800 | Adoptada en P2 |
| «¿Sigo?» → «sí» sin llamar a la IA (P2) | Un mensaje entero (0 tokens) | Adoptada en P2 |
| Historial recortado con resumen, apuntes con solo lo relevante | – | Ya estaba (IA-3 y memoria del chat) |
| Orden del prompt para la caché de Groq (lo fijo primero) | – | Ya estaba; lo nuevo (plan y recordatorio) va al final |
| No contar el prompt de sistema contra el alumno | ~4.700 por mensaje | Ya estaba (IA-3) |
| **Prompt compacto** (`prompt-compact.mjs`, −1.600 tokens) | El mayor ahorro posible | **No sustituido**: necesita el OK de Carlos y los evals con clave de Groq |
| **Razonamiento «none» fuera de mates en Normal** | El razonamiento oculto que cuenta como salida | **No adoptado**: sin evals no se sabe si empeora las explicaciones. Groq acepta el parámetro (dream-api ya lo usa en esquemas y en el router) |

### Tokens del prompt de sistema (Qwen3 / gpt-oss)

| | Antes de todo el encargo | Tras P2-P4 | Ahora (P6) |
|---|---:|---:|---:|
| Normal, con herramienta | 4.718 / 4.035 | 5.187 / 4.455 | **5.047 / 4.336** |
| Rápido | 1.659 / 1.458 | 2.073 / 1.823 | **1.933 / 1.704** |
| Pensar más | 1.620 / 1.404 | 2.017 / 1.755 | **1.877 / 1.636** |
| Búsqueda: respuesta | 1.301 / 1.126 | 1.751 / 1.522 | **1.611 / 1.403** |

Balance del encargo: **+329 tokens de sistema** en Normal (+7 %), pagados por
Dream (no por el alumno). A cambio:
- las respuestas, y con ellas el historial, son más cortas;
- el «sí» a «¿Sigo?» no gasta nada.

### Cómo medirlo tras desplegar (sin texto)

```sql
select mode, count(*) as mensajes, round(avg(tokens)) as tokens_medios,
  percentile_cont(0.5) within group (order by tokens) as mediana,
  floor(60000 / nullif(avg(tokens), 0)) as mensajes_por_ventana
from dream_private.ai_usage_attempts
where created_at > now() - interval '7 days' and kind = 'mode' and settled
group by 1;
```

`TYPICAL_MESSAGE_TOKENS` (1.100, la estimación de «te quedan N mensajes») se
deja igual hasta tener una semana de datos con la cuenta nueva.
