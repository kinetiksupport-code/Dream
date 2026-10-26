# Fuentes, fichas, comprobación de cuentas y guía de Groq (bloques 2 ter y 2 quater)

Todo esto va **apagado o sin usar** hasta medirlo con los evals (no hay clave de
Groq en este entorno). Cada medida se adopta solo si mejora los números.

| Medida | Dónde | Estado |
|---|---|---|
| Comprobar las operaciones de ciencias | `math-tools.mjs`, `AI_FLAGS.mathCheck` | Hecho y **apagado**. Aritmética exacta (BigInt), sin ejecutar nada del modelo. Si una igualdad no cuadra, pide una vez que la rehaga; si sigue mal, no enseña números falsos. Quita el «escribir poco a poco» en esas respuestas. |
| Fracción generatriz | `decimalToFraction` | 0,428571… → 3/7; 2,46 → 123/50; 1,2333… → 37/30 (con «…», paréntesis o `\overline`). |
| Plantilla de fuentes y citas | `sources.mjs` | Hecho, **sin conectar** al chat. Las citas que no están en la fuente se quitan y «NO ESTÁ EN LAS FUENTES» se dice con naturalidad. |
| Fichas de Dream | migración `20261030090000_knowledge_cards.sql` (**sin aplicar**), `supabase/seed/fichas-borrador.json` | 30 fichas en **borrador**: no se usan hasta que alguien las revise (`dream_card_review`, que exige el revisor). La búsqueda en español no distingue tildes y devuelve 1-3 fichas revisadas. La pantalla de revisión irá en el panel de administración. |
| Prompt compacto | `prompt-compact.mjs`, `docs/PROMPT_COMPACTO.md` | 1.556 tokens frente a 3.152. Solo en `--compact` del banco de pruebas. |
| Comprobación barata con gpt-oss-20b | — | Pendiente: primero hay que medir si las fichas y las citas bastan. |
| Respuestas cortas con reintento | — | Pendiente: con la regla de longitud del tono ya en el prompt, hay que medirlo antes de gastar otra llamada. |
| Caché de prompts de Groq | — | El orden ya es fijo → variable. Hay que medir `cached_tokens` con una clave real (duda 9). |

## mathjs

No se ha añadido. Los módulos de dream-api se prueban también en Node, y una
importación `npm:` lo rompería. Además, el fallo real (fracciones y decimales
periódicos) se cubre con aritmética exacta propia y probada. Si hace falta
derivar o resolver ecuaciones, se añade entonces, en un módulo aparte que solo
cargue Deno.

## Cargar las fichas (cuando Carlos dé el OK)

```bash
node scripts/ia/fichas-sql.mjs > /tmp/fichas.sql   # siempre como borrador
```
