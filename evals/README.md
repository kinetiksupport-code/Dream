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

## Cómo se ejecuta

Hace falta una clave de Groq (no hay ninguna en el repositorio ni en este
entorno). Con Tavily se mide la búsqueda de verdad; sin Tavily se mide qué hace
Dream cuando no puede comprobar.

```bash
GROQ_API_KEY=… TAVILY_API_KEY_1=… node evals/comparar-modelos.mjs \
  --models qwen/qwen3.8-27b,openai/gpt-oss-120b,openai/gpt-oss-20b \
  --files tono,tutor,no-inventar
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
