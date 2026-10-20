# Modos de la IA y límite por ventanas de 5 horas (Partes G y H)

Fecha: 17/10/2026. Rama `feat/modos-ia`. **Nada está desplegado ni aplicado.**
Actualizado el 19/10/2026 (rama `feat/limite-conjunto`): **un solo límite conjunto** para todos los modos (§3).

## 1. Qué ve el alumno

- En el chat, un selector con **«Rápido»** y **«Normal»** (por defecto). **«Pensar más»** aparece solo si el servidor tiene los secretos de Cloudflare (ver §6). No aparece ningún nombre de modelo.
- Hay **un solo límite** para todos los modos. Rápido lo gasta más despacio y Pensar más, más deprisa. En el selector, la pista de cada modo lo dice («Respuestas cortas, gasta menos», «Más cuidadoso, gasta más»).
- Si el límite pasa del 80 %, el chat muestra un aviso discreto («Has usado el 85 % de tu IA. Se reinicia en 2 h 10 min.»). No bloquea nada.
- Al 100 %: «Has usado toda tu IA por ahora. Vuelve a estar disponible a las 18:40». Todos los modos esperan al reinicio, así que **ya no hay botón «Cambiar a Rápido»**. El texto vuelve a la caja y no entra en la cola.
- En **Ajustes › Límite de uso**, una sola barra («Has usado el 63 % de tu IA.», `role="progressbar"`), «Se reinicia en 2 h 10 min.» y la línea «Rápido gasta la mitad, Normal lo normal y Pensar más el doble.». Nunca se muestran tokens ni modelos.
- El navegador recuerda el modo elegido (`dream-ai-mode`, ya en la página de cookies).

Capturas: [`docs/diseno/modos-ia/`](diseno/modos-ia/).

## 2. Modos y modelos

Todo se configura en **un solo archivo**: [`supabase/functions/dream-api/models.mjs`](../supabase/functions/dream-api/models.mjs).

| Modo | Proveedor | Modelo | Salida máx. (larga*) | Historial |
|---|---|---|---|---|
| Rápido | Groq | `openai/gpt-oss-20b`**** | 900 (1.400) | 8 mensajes, ≈3.000 caracteres |
| Normal | Groq | `qwen/qwen3.8-27b`** | 1.200 (2.048) | 14 mensajes, ≈7.000 caracteres |
| Pensar más | Cloudflare Workers AI | `@cf/mistralai/mistral-small-3.1-24b-instruct`*** | 1.500 (2.048) | 6 mensajes, ≈4.000 caracteres |
| Respaldo (Rápido/Normal) | Cloudflare Workers AI | el mismo que Pensar más | 700 | 4 mensajes, ≈2.500 caracteres |

\* La salida larga solo se usa si el alumno pide apuntes, un resumen o algo para imprimir (misma regla que `answerTokenBudget`).
\*\* Si Groq retira Qwen 3.8 (está en Preview), cambiar `GROQ_NORMAL_MODEL` a `openai/gpt-oss-120b` en `models.mjs` (Groq retiró `llama-3.3-70b-versatile` el 16/08/2026 en los planes gratis y Developer). El secreto `GROQ_MODEL`, si existe, sigue mandando sobre el modelo de Normal, tests y exámenes, como antes.
\*\*\* Identificador **comprobado el 19/10/2026** en el [catálogo de Workers AI](https://developers.cloudflare.com/workers-ai/models/mistral-small-3.1-24b-instruct/); no está en la [lista de retirados del 08/05/2026](https://developers.cloudflare.com/changelog/post/2026-05-08-planned-model-deprecations/). Precio: 0,351 $ / 0,555 $ por millón de tokens de entrada / salida (31.876 / 50.488 neuronas). Cupo gratis: 10.000 neuronas al día, reinicio a las 00:00 UTC ([precios](https://developers.cloudflare.com/workers-ai/platform/pricing/)).
\*\*\*\* **Desde el 19/10/2026, decisión de Carlos.** Groq retiró `llama-3.1-8b-instant` el 16/08/2026 en los planes gratis y Developer ([deprecations](https://console.groq.com/docs/deprecations)) y recomienda `openai/gpt-oss-20b` (0,075 $ / 0,30 $ por millón, ya en `20261019143700_verified_model_prices.sql`). Es un modelo de razonamiento:
  - Se envía `reasoning_effort: "low"` e `include_reasoning: false` ([razonamiento en Groq](https://console.groq.com/docs/reasoning)). gpt-oss no admite `reasoning_format`.
  - Salida de 500 (900) a **900 (1.400)**: Groq no documenta si el razonamiento cuenta en el máximo de salida, así que se deja margen. La respuesta visible sigue corta porque el prompt pide ≤120 palabras.
  - En la ventana de 5 h se carga el uso real (`prompt_tokens + completion_tokens`) que devuelve Groq, razonamiento incluido si lo cuenta ahí (Groq no lo documenta). La estimación previa usa el nuevo máximo de salida.
  - **Sin probar con una clave real** (no la hay en el entorno de desarrollo). Primer mensaje en staging antes de producción.

**Razonamiento oculto (todos los modos).** `reasoningParams` (en `models.mjs`) decide según el modelo real que se envía, porque el secreto `GROQ_MODEL` puede cambiar el de Normal:
- gpt-oss: `include_reasoning: false`, y el `reasoning_effort` del modo si tiene.
- Qwen 3.8: `reasoning_format: "hidden"`, porque por defecto es `raw`, con `<think>` dentro del texto.
- Cloudflare y otros modelos: nada.

Además, `withoutReasoning` (en `ai-router.mjs`) quita los campos `reasoning` y `reasoning_content` y el texto entre `<think>` y `</think>` antes de enviar o guardar, también si las etiquetas llegan partidas. Si el razonamiento no se cierra, no se muestra nada. Normal sigue en `qwen/qwen3.8-27b`: sigue en la lista de Groq (Preview) y es el sucesor de `qwen3.6-27b`. El plan B es `openai/gpt-oss-120b` (0,15 $ / 0,60 $), solo documentado aquí.

Tests, exámenes y corrección siguen usando el modelo de Normal y **no cuentan** en las ventanas: siguen con los límites diarios de `dream_private.limits`. Así una corrección no se bloquea a mitad de un examen.

### Prompts

[`prompts.mjs`](../supabase/functions/dream-api/prompts.mjs) define `COMMON_RULES` **una sola vez** y los tres prompts empiezan por él:

1. «Estás hablando con una IA»: nunca finge ser humano.
2. Responde siempre en español.
3. Nunca da el ejercicio resuelto: solo pistas y preguntas, y revisa los intentos.

- **Normal** = bloque común + `DREAM_SYSTEM_PROMPT` sin tocar + una línea de longitud (≈4.400 tokens).
- **Rápido** = bloque común + instrucciones cortas para un modelo de 8B (≈410 tokens, máximo 120 palabras).
- **Pensar más** = bloque común + instrucciones para Mistral Small (≈540 tokens, razonar por dentro y comprobar, máximo 350 palabras). El respaldo usa este mismo prompt porque es el mismo modelo.

Los tres modos y el respaldo pasan por el mismo constructor (`chatSystemMessages`): misma política de conversación y misma regla de no escribir respuestas de un test activo. No había un filtro de salida previo en el código; no he añadido uno.

## 3. Límite conjunto (decisión de Carlos, 19/10/2026)

> «El límite es uno conjunto y los modelos más altos consumen más; si coges Rápido el límite no se gasta tan rápido, si coges Pensar más se gasta más rápido.»

Todo está en **dos líneas** de `models.mjs`:

```js
export const SHARED_WINDOW_BUDGET = 40_000;                          // por alumno y ventana de 5 h
export const MODE_WEIGHTS = Object.freeze({ fast: 0.5, normal: 1, think: 2 });
```

- El límite se cuenta en tokens «equivalentes a Normal» (entrada + salida).
- Cada petición carga `ceil(tokens reales × peso del modo)`. El ajuste final (`settle`) usa el mismo peso.
- El respaldo de Cloudflare (`kind = 'fallback'`) **no cuenta**, como antes.
- Al llegar al 100 % se bloquean **todos** los modos hasta el reinicio.
- Se sigue guardando una fila por modo (`dream_private.ai_usage`), ya con el peso: sabemos qué modo se usó.
- La frase «gasta la mitad / lo normal / el doble» sale del peso (`relativeCost`). Si se cambia un peso, el texto cambia solo («menos» o «más» si no es una fracción conocida).

| Modo | Peso | Mensaje típico (real) | Cuesta del límite | Mensajes si solo usas ese modo |
|---|---|---|---|---|
| Rápido | 0,5 | ≈2.000 | ≈1.000 | ≈40 |
| Normal | 1 | ≈6.500 | ≈6.500 | ≈6 |
| Pensar más | 2 | ≈3.500 | ≈7.000 | ≈5–6 |

Antes eran tres presupuestos separados (Rápido 30.000, Normal 40.000, Pensar más 12.000). Con el límite conjunto, un alumno que solo usa Normal tiene lo mismo que antes. Uno que solo usa Pensar más tiene hasta 20.000 tokens reales (antes 12.000). Uno que solo usa Rápido, hasta 80.000 (antes 30.000).

**Las cuatro claves de Groq se reparten la carga** (decisión de Carlos, 20-oct-2026). Un 429 enfría solo esa clave y la petición prueba la siguiente; la pausa (`provider_state`) solo se guarda cuando las cuatro dan 429. Los topes diarios de `dream_private.limits` siguen activos y mandan si se alcanzan antes. Si Rápido se usa mucho, el tope que se nota antes es el diario de Groq de gpt-oss-20b (200.000 tokens/día por organización), no la ventana.

### Cifras anteriores (presupuesto por modo, ya no se usan)

Se dejan para entender de dónde salen los 40.000 y el peso de Pensar más.

| Modo | Presupuesto / 5 h | Mensaje típico | Mensajes aprox. |
|---|---|---|---|
| Rápido | 30.000 | ≈2.000 | ≈15 |
| Normal | 40.000 | ≈6.500 | ≈6 |
| Pensar más | 12.000 | ≈3.500 | ≈3 |

### Cómo he llegado a esas cifras

Cupos de Groq que me has dado: **30 peticiones/min, 8.000 tokens/min y 200.000 tokens/día por organización y modelo**. Las cuatro claves son de cuatro organizaciones. Hasta el 20-oct-2026 solo eran respaldo de una caída (capacidad real 200.000 tokens/día por modelo). Desde entonces se reparten la carga y un 429 prueba la siguiente clave, así que la capacidad sube hasta **4 × 200.000 tokens/día por modelo**.

- **Mensaje típico** (≈3,6 caracteres por token, medido en el código):
  - Rápido: 410 de instrucciones + 250 de política + ≈450 de memoria y habilidades + ≈850 de historial + salida corta (más el razonamiento de gpt-oss, `low`). ⚠️ El presupuesto de 30.000 se calculó con Llama 8B: revisar con el uso real de las primeras semanas.
  - Normal: el cálculo de `docs/CAPACIDAD_IA.md` (≈6.500).
  - Pensar más: 540 + 250 + 450 + ≈1.150 de historial + hasta 1.500 de salida.
- **Rápido (gpt-oss-20b; cálculo hecho con Llama 8B):** 200.000 / 30.000 ≈ 6–7 ventanas completas al día para todos. Con 8.000 tokens/min caben unos 4 mensajes por minuto. Los cupos de gpt-oss-20b que publica Groq para el plan Developer son 30 peticiones/min, 1.000/día, 8.000 tokens/min y 200.000 tokens/día ([límites](https://console.groq.com/docs/rate-limits)).
- **Normal (Qwen):** 200.000 / 40.000 = 5 ventanas completas al día para todos. 8.000 tokens/min ≈ 1 mensaje por minuto: ahí entra la cola de la Parte A.
- **Pensar más (Cloudflare, 10.000 neuronas/día, comprobado el 19/10/2026):**
  - Comprobado el 19/10/2026: 31.876 neuronas por millón de tokens de entrada y 50.488 por millón de salida. Un mensaje de 2.500 + 1.000 tokens gasta unas 130 neuronas, así que caben unos 75 mensajes al día en total.
  - Reservo la mitad para el respaldo: unos 38 mensajes de Pensar más. Con 12.000 por ventana (≈450 neuronas) salen unas 11 ventanas completas al día.

**Conclusión honesta:** con el plan gratis, estos presupuestos reparten de forma justa, pero no crean capacidad. Bastan 5 alumnos que agoten Normal para gastar el día de Groq. Los topes diarios de `dream_private.limits` siguen activos (propuesta en `CAPACIDAD_IA.md` §4.1) y mandan si se alcanzan antes.

### Reglas de la ventana

- Empieza con el **primer mensaje enviado al proveedor** cuando no hay otra abierta y dura 5 h. Sin ventana, todo está al 0 %.
- Se comprueba **antes** de guardar el mensaje y de llamar al proveedor, y otra vez de forma atómica al enviar (`dream_ai_window_charge`, una fila por alumno con `FOR UPDATE`).
- Al enviar se carga una estimación (caracteres ÷ 3,5 + máximo de salida). Al terminar se ajusta al uso real que devuelve el proveedor. Un intento que falla sin producir texto vuelve a 0.
- Todos los modos se bloquean cuando la suma de lo usado (con el peso) llega al límite conjunto. Puede pasarse un poco con el último mensaje: es más amable que cortar al 85 %. El porcentaje solo marca 100 cuando está agotado.
- Convive con la cola de la Parte A: la cola cubre los picos por minuto (`dream_rpm`, `dream_queue`…); la ventana, el uso de cada alumno (`dream_mode_limit`, que nunca se pone en cola; el código se mantiene aunque ahora el límite sea conjunto).

## 4. Respaldo con Cloudflare (Parte H)

- [`cloudflare.mjs`](../supabase/functions/dream-api/cloudflare.mjs) tiene la misma interfaz que el gestor de Groq (`request`, `stream`, `configured`). Usa la API compatible con OpenAI: `…/accounts/{id}/ai/v1/chat/completions`.
- Lee los secretos `CLOUDFLAREAI_API_KEY` y `CLOUDFLARE_ACCOUNT_ID`. Si faltan o no son válidos, `configured()` es falso: el respaldo se desactiva en silencio y se usa la cola. Nunca llega al navegador.
- **Orden** ([`ai-router.mjs`](../supabase/functions/dream-api/ai-router.mjs)): Groq primero para Rápido y Normal.
  - Si **todas** las claves fallan antes de escribir nada (5xx, caída, `all_keys_cooling_down` o un 429 en cada una), o Groq está en pausa guardada, se prueba Cloudflare.
  - Si también falla, el alumno ve la cola como antes.
  - Nunca se reintenta si ya llegó texto.
  - Si la respuesta usaba la búsqueda web, el respaldo recibe el resultado como contexto, sin herramientas.
- **Contexto corto:** el respaldo envía 4 mensajes de historial y 6.000 caracteres de adjuntos como máximo.
- **Uso aparte:** en `dream_private.ai_usage` con `kind = 'fallback'` y `provider = 'cloudflare'`. No cuenta en el límite conjunto. El intento fallido de Groq se devuelve a 0.
- Un 429 de Cloudflare pausa ese proveedor hasta las 00:00 UTC (reinicio del cupo diario), salvo que indique otra espera.

## 5. Base de datos: migración pendiente (NO aplicada)

[`supabase/migrations/20261017090000_ai_modes_windows.sql`](../supabase/migrations/20261017090000_ai_modes_windows.sql):

- **Tablas** en `dream_private`: `ai_windows`, `ai_usage` y `ai_usage_attempts`.
  - RLS activada y sin políticas; sin permisos para `anon` ni `authenticated`.
  - Clave foránea a `auth.users` con `on delete cascade`.
  - Solo tokens, peticiones y fechas; nunca texto.
- **Funciones** `security definer`, solo para `service_role`:
  - `dream_ai_window_charge`: atómica.
  - `dream_ai_window_settle`: idempotente.
  - `dream_ai_usage`: solo lectura.
  - `dream_ai_usage_cleanup`: borra el uso de más de 30 días; programarla junto a `dream_admission_cleanup()`.
- **Admisión:**
  - `dream_reserve` y `dream_reconcile` aceptan el proveedor `cloudflare`.
  - `provider_state` admite `cloudflare`.
  - Precios de `llama-3.1-8b-instant`, `llama-3.3-70b-versatile` y del modelo de Cloudflare, **sin verificar** (marcados en `source`).
  - Sin esa fila de precio, Rápido respondería 503 `model_unpriced`.
- **Orden:** aplicar la migración **antes** de desplegar `dream-api`. Sin ella, el chat responde 503 (`admission_unavailable`) y no se salta ningún límite.

La he probado en un PostgreSQL 16 local de usar y tirar, aplicando antes las migraciones de admisión. Comprobé:

- Sin ventana, 0.
- Apertura de la ventana.
- Bloqueo por modo y otro modo libre.
- El respaldo no cuenta.
- El ajuste es idempotente.
- Caducidad y ventana nueva.
- Validación.
- RLS y permisos.
- Borrado en cascada.

No forma parte de `npm run test:security-db`.

### Límite conjunto: [`20261019180000_ai_shared_window.sql`](../supabase/migrations/20261019180000_ai_shared_window.sql) (NO aplicada)

- Solo redefine `dream_ai_window_charge`. Con `kind = 'mode'`, la comprobación suma los tokens de **todos** los modos de la ventana, no solo los de `p_mode`.
- Misma firma y mismos permisos (solo `service_role`). `dream_ai_window_settle` y `dream_ai_usage` no cambian.
- Se puede aplicar **antes o después** de desplegar el `dream-api` nuevo:
  - Con el `dream-api` v27 (producción), que envía el presupuesto de cada modo y tokens sin peso, solo se vuelve **más estricto**: un modo se bloquea cuando la suma de todos llega a su presupuesto. Nunca deja pasar más que antes.
  - En v27, `ai_usage` sigue mostrando un porcentaje por modo, que puede ir por debajo de lo que la base de datos ya bloquea. La web enseña el mensaje de límite al recibir `dream_mode_limit`, sin perder el texto.
- Orden recomendado: migración → `dream-api` → web.
- Probada en un PostgreSQL 16 local de usar y tirar (`/tmp/pgdream-limite`, como `nobody`), sobre las tablas de `20261017090000`:
  - suma de todos los modos;
  - bloqueo de todos los modos al agotarse;
  - el respaldo no cuenta;
  - el comportamiento de v27, que es más estricto;
  - ajuste idempotente;
  - ventana nueva al caducar;
  - validación;
  - permisos: solo `service_role`;
  - aplicar dos veces no falla.

## 6. Interruptores (ENCENDIDOS desde el 19/10/2026)

En `models.mjs`, `AI_FLAGS`:

| Flag | Qué activa | Además necesita |
|---|---|---|
| `thinkMode` | «Pensar más» visible y usable | secretos de Cloudflare |
| `cloudflareFallback` | respaldo de Rápido y Normal | secretos de Cloudflare |

Están en el código y no en un secreto, para que activarlos pase por revisión y despliegue.

Encendidos no bastan: sin `CLOUDFLAREAI_API_KEY` y `CLOUDFLARE_ACCOUNT_ID` válidos (`aiContextFor` en `models.mjs`):

- `ai_usage` no incluye `think` en `modes`, así que la web no muestra «Pensar más». Si el navegador lo tenía guardado, vuelve a Normal (`pickMode`).
- `chat` con `mode: "think"` responde 400 `mode_unavailable` («Ese modo no está disponible ahora. Elige otro.»). La web lo muestra, devuelve el texto a la caja y vuelve a pedir `ai_usage`, que ya no ofrece el modo.
- El respaldo de Rápido y Normal sigue apagado sin avisar; Groq funciona como antes.

Un 429 de Groq enfría solo esa clave y la petición prueba la siguiente. Cloudflare solo entra cuando las cuatro claves han fallado, y es otro proveedor con su propia admisión diaria.

## 7. Acción nueva de `dream-api`

`ai_usage` es de solo lectura y no consume IA. Devuelve:

```
{ window, percent, blocked, resets_at,            // el límite conjunto
  modes: [{ id, label, percent, blocked, resets_at, cost, relative_cost }],
  default_mode }
```

- `percent`, `blocked` y `resets_at` de arriba son el límite conjunto.
- En `modes[]`, cada modo lleva **los mismos** `percent` y `blocked`: así la web antigua sigue funcionando y, al 100 %, todos sus modos salen agotados.
- `cost` (`less` | `same` | `more`) y `relative_cost` («la mitad», «lo normal», «el doble») dicen cuánto gasta cada modo, sin cifras.
- Una web nueva con un servidor antiguo (sin los campos de arriba) toma el modo más gastado. Si ese servidor deja otro modo libre, sigue ofreciendo «Cambiar a…».

 `chat` acepta `mode` (`fast` | `normal` | `think`); sin `mode`, usa Normal. Un modo apagado o desconocido devuelve 400 `mode_unavailable`.

## 8. Qué necesita el OK de Carlos

1. ~~Presupuestos por modo~~: sustituidos por el **límite conjunto** (§3). Valores por defecto: 40.000 y pesos 0,5 / 1 / 2. Carlos puede cambiarlos en `models.mjs`.
   - **Migración** `20261019180000_ai_shared_window.sql`: revisar y aplicar, mejor antes de desplegar el `dream-api` nuevo (funciona en cualquier orden, §5).
2. **Migración** `20261017090000_ai_modes_windows.sql`: revisar, hacer copia de seguridad y aplicarla en staging antes que en producción.
3. **Despliegue** de `dream-api`, después de la migración.
4. **Secretos** `CLOUDFLAREAI_API_KEY` y `CLOUDFLARE_ACCOUNT_ID` en Supabase. Token de cuenta limitado a esa cuenta con los permisos «Workers AI - Read» y «Workers AI - Edit», los que pide la [guía de la API REST](https://developers.cloudflare.com/workers-ai/get-started/rest-api/); ningún otro.
5. ~~Confirmar el identificador y los precios~~: comprobado el 19/10/2026 (§2 y `20261019143700_verified_model_prices.sql`, sin aplicar). Rápido pasa a `openai/gpt-oss-20b` (decisión de Carlos, 19/10/2026). **Queda:** probar Rápido con una clave real en staging y mirar los cupos reales en `console.groq.com/settings/limits`.
6. ~~Encender `thinkMode` y `cloudflareFallback`~~: encendidos en la rama `feat/cloudflare` (§6).
7. ~~Textos legales~~: actualizados en `feat/cloudflare` (privacidad, términos y cookies) y aprobados por Carlos el 19/10/2026.
