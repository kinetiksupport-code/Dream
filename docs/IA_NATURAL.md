# IA natural, que se conoce y que no inventa (bloques 0, 1, 2 y 2 bis)

Petición de Carlos del 22/10/2026. Este documento resume lo que hace el código
y lo que falta por medir. Nada de esto toca `DREAM_SYSTEM_PROMPT`: va detrás.

## Qué cambia para el alumno

- **Tono** (`TONE_LAYER`, en los tres modos y en la respuesta con búsqueda):
  habla como una persona, ajusta la longitud a la suya y no usa las frases
  robóticas prohibidas. Lleva la pareja «mal → bien» del caso de los sintagmas.
- **Sabe qué es Dream** (`selfKnowledge()` en `features.mjs`): se genera desde
  la lista única de funciones (`DREAM_FEATURES`, reexportada en
  `lib/features.ts`). Lo que está detrás de un interruptor apagado (la memoria)
  no aparece. No nombra el modelo ni la empresa de IA.
- **No inventa** (`NO_INVENT_LAYER` + `fact-check.mjs`): el servidor marca con
  reglas (sin IA) las peticiones de concepto, dato, fecha, regla o método y
  **lanza él la búsqueda** (`tool_choice: required`). La consulta que sale a
  Tavily se limpia: sin apodo, nombre, aficiones, correos, teléfonos ni
  enlaces, y si el modelo pega el enunciado se queda en 6 palabras. Con apuntes
  adjuntos no se busca (la fuente son los apuntes).
- **Sin cupo de búsqueda** la IA no inventa: se le dice que no ha podido
  comprobarlo y que, si no está segura, diga que no lo sabe con claridad; el
  alumno ve el aviso de siempre.
- **Fórmulas**: la hoja de estilos de KaTeX pasa al CSS global
  (`app/layout.tsx`). «246100100246» es exactamente lo que se ve cuando esa hoja
  no está: la copia MathML pegada a la HTML, que pone el denominador delante.
  Al copiar (selección o botón «Copiar») cada fórmula sale en texto: `246/100`,
  `√2`, `x^2`.

## Tokens (tokenizador real, `scripts/ia/medir-tokens.py`)

| Prompt de sistema | Antes (Qwen3 / gpt-oss) | Ahora (Qwen3 / gpt-oss) |
|---|---:|---:|
| Normal, con herramienta | 4.090 / 3.483 | 4.718 / 4.035 |
| Rápido | 1.031 / 906 | 1.659 / 1.458 |
| Pensar más | 992 / 852 | 1.620 / 1.404 |
| Búsqueda: planificador | 390 / 349 | 454 / 404 |
| Búsqueda: respuesta | 880 / 760 | 1.301 / 1.126 |

Partes nuevas (Qwen3): tono 277 (≤ 200 + 80 del ejemplo), no inventar 142
(≤ 150), quién eres 207 (229 con la memoria activada; ≤ 250). Total Normal:
**4.718 ≤ 6.000**. El presupuesto que queda para perfil (≤ 120) y memoria
(≤ 300) cabe: 5.138.

## Lo que falta por medir (no hay clave de Groq en este entorno)

Los evals (`evals/`, ver su README) están listos, con comprobaciones
automáticas probadas contra respuestas reales buenas y malas, pero **no se han
ejecutado contra el modelo**. Con `GROQ_API_KEY` y `TAVILY_API_KEY_1`:
`npm run eval:ia`. Hasta entonces no hay porcentajes de mejora; no se ha
adoptado ninguna medida «porque mejora los números».

- Razonamiento `medium` en Matemáticas, Física y Química: **no activado**. El
  parámetro que acepta `qwen/qwen3.8-27b` en Groq hay que comprobarlo (la
  documentación se contradice: duda 10) y un parámetro no válido rompe el
  chat. `isStemPrompt()` ya detecta esos casos.
- Muestreo de la ficha de Groq (1,0/0,95 con razonamiento; 0,7/0,8 sin él)
  frente al 0,5 actual: se compara con `--temperature`.
- Coste en tokens de una respuesta con búsqueda: dos llamadas (planificador
  ~454 + respuesta ~1.301 de sistema, más historial y resultados).

## Tavily gratis

1.000 créditos al mes por clave: con 2 claves son unas **66 búsquedas al día
para todo Dream**. Por eso la búsqueda automática lleva un tope diario global
(`dream_private.limits.forced_searches_daily`, 60 por defecto; aviso en los
logs al 80 %). La migración `20261027090000_forced_search_budget.sql` está
**sin aplicar**; sin ella dream-api no pone tope global (sigue el tope por
alumno de siempre). Si la búsqueda automática gusta, con este cupo se acaba
pronto: es el techo del plan gratis, no del código.

## Notas

- La capa pedagógica (`PEDAGOGY_LAYER`) que cita el encargo **no existe en el
  código** (ninguna rama la tiene). «Te creó Carlos Sánchez» va en «quién
  eres», una sola vez.
- Sintagmas: en el código no hay ninguna instrucción de «explicar el análisis
  completo». La habilidad MEJORAR (rama de sintagmas) pide «indica primero un
  acierto concreto», que empuja al arranque «Has identificado bien…»; la regla
  de un paso por mensaje y el tono mandan.
