# Evals de la IA de Dream

Casos fijos para medir cómo responde Dream con el **mismo prompt que usa
dream-api**. Las comprobaciones son automáticas (sin IA) y están en
`checks.mjs`; `tests/ia-natural.test.ts` comprueba que aciertan con respuestas
reales buenas y malas (el caso de los sintagmas del 22/10/2026).

| Archivo | Qué mide |
|---|---|
| `tono.json` | 21 conversaciones: saludos, «no entiendo nada», «mañana examen», dudas rápidas, mensajes muy cortos. Frases prohibidas, longitud (un saludo ≤ 40 palabras), sin títulos ni listas sin pedirlas, apodo en ≤ 1 de cada 3 mensajes. |
| `tutor.json` | Un paso por mensaje sin dar la solución. Incluye el caso real de los sintagmas: ≤ 60 palabras, sin lista numerada, una sola pregunta al final, sin «¿Te queda claro», «¿lo entiendes» ni «Sin embargo», y sin decir cuál es el núcleo del segundo grupo. |
| `no-inventar.json` | 21 casos: fechas, autores, fórmulas, artículos de la Constitución, PAU, preguntas imposibles («qué pasó en el examen de mi clase de ayer») y ejercicios poco comunes. Busca cuando debe, no afirma lo que no encontró, dice «no lo sé» cuando procede y no pega el enunciado en la búsqueda. Incluye la fracción generatriz (3/7, 123/50, 37/30 y sin números duplicados). |

| `conversacion.json` | Dos conversaciones completas simuladas (fracción generatriz de 2,46): un alumno que acierta cada paso y otro que falla el paso 2. Cada turno: un paso, sin lista, ≤ 120 palabras; al final, resultado correcto y ningún paso repetido. |

Además de los criterios de cada caso, el informe da la **forma** de todas las
respuestas (P1, `docs/HABLA_NATURAL.md`):
- palabras (media, mediana y percentil 90);
- el % con listas, títulos, negritas, frases de robot y procedimiento entero;
- caracteres de otras escrituras;
- legibilidad Fernández-Huerta;
- ortografía con hunspell en español, en errores por 100 palabras.

Las frases de robot y el escáner son los mismos que usa dream-api
(`supabase/functions/dream-api/reply-shape.mjs`).

## Cómo se ejecuta

Hace falta una clave de Groq (no hay ninguna en el repositorio ni en este
entorno). Con Tavily se mide la búsqueda de verdad; sin Tavily se mide qué hace
Dream cuando no puede comprobar.

```bash
GROQ_API_KEY=… TAVILY_API_KEY_1=… node evals/comparar-modelos.mjs \
  --models qwen/qwen3.8-27b,openai/gpt-oss-120b,openai/gpt-oss-20b \
  --files tono,tutor,no-inventar,conversacion
# Variantes para comparar cada medida por separado:
#   --no-forced-search          sin la búsqueda que lanza el servidor
#   --reasoning none|low|medium razonamiento
#   --temperature 0.3
```

Escribe una tabla por modelo (porcentaje por criterio, palabras medias, tokens
por caso) y guarda el detalle en `evals/resultados/`. Los casos fallidos llevan
la respuesta para revisarla a mano. Cloudflare (`@cf/…`) y OpenRouter (`…:free`)
funcionan si están sus claves; no se usan en producción sin el OK de Carlos.

## Tokens del prompt

```bash
pip install tokenizers
python3 scripts/ia/medir-tokens.py
```

Usa el tokenizador real de Qwen3 (el de Qwen 3.8 no está publicado; es la
misma familia) y el de gpt-oss.

## Explicaciones de preguntas corregidas (`explicaciones.json`)

Seis casos fijos (visigodos, fracción generatriz, un sintagma, una ecuación,
un verdadero/falso y una respuesta escrita) con un perfil de prueba (aficiones:
fútbol y videojuegos). Se comprueba con `explanation-style.mjs` (el mismo
módulo que usa dream-api): empieza por «Es correcta porque» (o «No es esa:» en
`why_wrong`), ≤ 60 palabras sin contar los pasos de mates, dato clave en
negrita, `why_wrong` de la opción que eligió el alumno, sin «¿Te queda claro?»
y, si hay ejemplo, con una afición del perfil.

```bash
node evals/explicaciones.mjs                    # comprueba las referencias
GROQ_API_KEY=… node evals/explicaciones.mjs     # pide las explicaciones a la IA
```
