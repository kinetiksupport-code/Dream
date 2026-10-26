# Límite de uso del alumno (bloques 8 y 8 bis)

## El problema (Carlos, 22/10/2026)

El límite se agotaba con unos 7 mensajes, a veces 15. **Causa comprobada en el
código**: cada mensaje cargaba al límite del alumno todo lo que se enviaba al
proveedor (`estimateWindowTokens`), y casi todo es el prompt de sistema de
Dream, que se reenvía en cada mensaje.

Medido con el tokenizador real de Qwen3 (`python3 scripts/ia/medir-tokens.py
--conversaciones`), en 5 conversaciones de prueba (sintéticas, sin datos
reales) y suponiendo 350 tokens de salida:

| Conversación | Sistema | Historial | Apuntes | Mensaje | Antes contaba | Ahora cuenta |
|---|---:|---:|---:|---:|---:|---:|
| Saludo, chat nuevo | 4.597 | 0 | 0 | 2 | 4.949 | 352 |
| Duda de mates, 3 turnos | 4.597 | 185 | 0 | 7 | 5.139 | 403 |
| Chat largo (14 mensajes) | 4.597 | 721 | 0 | 11 | 5.679 | 541 |
| Con apuntes (≈8.000 caracteres) | 4.597 | 94 | 2.583 | 8 | 7.632 | 1.027 |
| Pregunta corta tras 2 turnos | 4.597 | 94 | 0 | 1 | 5.042 | 375 |

Con 40.000 de presupuesto y ~5.500 por mensaje salían **7 mensajes**: justo lo
que vio Carlos.

## Qué cambia

- **Contra el límite del alumno cuenta** su mensaje nuevo, la respuesta (con el
  razonamiento oculto: `completion_tokens` real) y el **25 %** del historial,
  de sus apuntes y de los resultados de búsqueda (`WINDOW_CONTEXT_SHARE`). El
  prompt de sistema y las capas fijas no cuentan: son coste de Dream.
- **Presupuesto propuesto: 60.000 por ventana de 5 horas** (antes 40.000), en
  `SHARED_WINDOW_BUDGET` (models.mjs, el único sitio). Con la cuenta nueva son
  unos **55 mensajes normales** (1.100 de media; 30 si todos llevan apuntes
  largos). Carlos lo confirma o lo cambia ahí.
- **La barra de uso dice «Te quedan unos N mensajes»** en Ajustes y en el aviso
  del chat, que sale desde el 80 % (antes de bloquear, no después).
- **Contabilidad por partes**: cada mensaje deja en los logs
  `dream_prompt_breakdown` (sistema, apuntes, historial, herramienta, mensaje,
  máximo de salida y lo que se carga al alumno), en tokens estimados y sin
  texto. Junto con `dream_call_usage` (uso real que devuelve Groq) sirve para
  la medición de la primera semana.
- El respaldo de Cloudflare se sigue registrando entero y sin contar.

## El techo real: el cupo gratis del proveedor

Subir el límite por alumno **no crea capacidad**. Valores en producción
(consultados el 26/10/2026, solo lectura):

- `dream_private.limits`: 500.000 tokens y 1 $ al día por alumno; **2.000.000
  tokens al día para todo Dream**. Con ~5.500 tokens reales por mensaje de
  Normal son **unos 360 mensajes al día entre todos los alumnos**.
- Groq gratis: unos 200.000 tokens al día por modelo y organización (duda 8,
  sin confirmar). Si es así, **Qwen da para unos 36 mensajes al día por
  organización**. Esto pesa más que cualquier límite por alumno.

Cuando se acaba el cupo del proveedor, el alumno ve «La IA gratis de hoy se ha
agotado. Vuelve más tarde.» (`provider_daily_limit`), y si es por minuto, el
aviso de saturación con la espera. Lo que de verdad alarga el cupo es **gastar
menos por mensaje**: ver abajo.

## Ahorro de tokens por mensaje (bloque 8 bis): estado

| Medida | Estado |
|---|---|
| Qué cuenta contra el alumno | **Hecho** (este PR). |
| Historial recortado | Ya existía: Normal envía 14 mensajes como mucho, los 4 últimos enteros y el resto en 300 caracteres (7.000 caracteres en total). Falta el resumen acumulado (≤ 150 tokens). |
| Imágenes y apuntes | Ya no se reenvían: un adjunto va solo con el mensaje en que se sube (`message_id is null`). Falta recuperar solo los 2-4 fragmentos relevantes de los apuntes. |
| Prompt compacto y modular | **El mayor ahorro** (de ~4.600 a ~1.500 tokens de sistema por mensaje), pero exige cambiar `DREAM_SYSTEM_PROMPT`. Necesita el OK de Carlos y los evals (duda 2). No se ha tocado. |
| Caché de prompts de Groq | El orden ya es fijo → variable. Hay que comprobar `cached_tokens` con clave real (duda 9). |
| Respuestas sin IA para preguntas sobre Dream | Pendiente: sale de `DREAM_FEATURES`. |
| Cortar al cancelar | Ya existía: `cancel()` aborta la generación y un turno sin texto se devuelve a 0. |

## Primera semana: cómo medir

En Supabase › Logs › Edge Functions, filtrar `dream_prompt_breakdown` y
`dream_call_usage`. No guardan texto del alumno. Con eso se fijan
`SHARED_WINDOW_BUDGET` y `TYPICAL_MESSAGE_TOKENS` con datos, y se decide si hace
falta pasar Groq a pago (no se cambia nada de plan sin el OK de Carlos).
