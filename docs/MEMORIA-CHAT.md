# Memoria de la conversación: que el chat no «se haga el tonto»

Encargo: `prompt-claude-code-memoria-de-conversacion.md` (27/10/2026). Caso real: Carlos adjunta sus apuntes de sintagmas, pide «genérame un Dreams de los sintagmas, un juego», el chat contesta en texto y después le pide que vuelva a subir el archivo.

## Bloque 0 · Diagnóstico (con datos de producción, sin contenido)

Datos del 27/10/2026, solo contadores (logs `dream_mode_resolved` y `dream_prompt_breakdown`, tamaños en tokens estimados):

| Conversación | Turno | Adjuntos | Material | Historial | Tarjeta Dreams |
|---|---|---|---|---|---|
| `1f393100…` (15:58) | 1 | 6 | 7.089 | 0 | no |
| | 2–5 | 0 | **0** | 652–957 | no |
| `9a79e4ca…` (17:19) | 1 | 1 | 643 | 0 | no |
| | 2–3 | 0 | **0** | 203–311 | no |

En la primera, el archivo se subió otra vez a las 15:58 y nunca se llegó a enviar (quedó sin mensaje): el patrón de «súbeme el archivo».

Las 4 causas posibles del encargo:

1. **El texto del adjunto solo viaja en el mensaje donde se subió: CONFIRMADA (causa principal).** `chat` solo carga los archivos que llegan en `attachment_ids` de ese turno y que aún no tienen mensaje (`.is('message_id', null)`). Tras el primer turno se enlazan a ese mensaje y no vuelven nunca; el historial guarda solo el texto del alumno. Desde el turno 2 el modelo no sabe que hay apuntes (material = 0 en todos los turnos siguientes). `test_generate` tenía el mismo filtro.
2. **El modelo no sabe que existen los Dreams: CONFIRMADA.** `DREAM_FEATURES` (features.mjs) no los incluye, así que `DREAM_SELF_KNOWLEDGE` tampoco.
3. **Cada turno se atiende solo con el último mensaje: CONFIRMADA.** Quién decide si es un Dreams es el navegador, con expresiones regulares sobre el mensaje actual (`wantsScheme`/`wantsGame`). «genérame un Dreams de los sintagmas» (sin «juego» ni «esquema») va al chat normal, y «un juego» sin archivo en ese mismo mensaje recibía «necesito tus apuntes», también pidiendo lo que ya había.
4. **La ventana deslizante recorta el mensaje del adjunto: DESCARTADA en estos casos** (historial de 203–957 tokens), pero en chats de 30+ mensajes la primera petición sí acabaría fuera; la pizarra (Bloque 2) la ancla.

## Arreglo

- **Adjuntos de la conversación (Bloque 1).** Se reutiliza `dream_attachments`, que ya guarda el texto extraído por conversación, con RLS por alumno y borrado en cascada: no se duplica en otra tabla. En cada turno va un **índice corto** («Archivos de esta conversación: 1) apuntes-sintagmas.pdf — resumen») y la regla destacada «nunca pidas que vuelva a subir un archivo de la lista». El texto entra **solo cuando la tarea lo necesita** (reglas + búsqueda de texto completo de Postgres en español, sin IA). Si aun así la respuesta pide volver a subirlo, el servidor la **rehace** con el contenido y una nota corta.
- **Pizarra (Bloque 2).** JSON pequeño en `dream_conversations.board` (≤ 200 tokens): primera petición anclada, petición pendiente, archivos activos, Dreams entregados. Va en la parte variable del prompt y no se recorta nunca.
- **Router (Bloque 3).** Acción `chat_route` (sin gastar cupo): reglas primero; si la petición es corta o con referencias («eso», «otra vez», «un juego») y las reglas no bastan, una llamada pequeña con salida estructurada. Decide chat, esquema, juego, test o una sola pregunta útil. Los Dreams se crean con las acciones que ya existen, usando los archivos de la conversación aunque el mensaje no traiga ninguno.
- **Autoconocimiento:** los Dreams entran en la lista única de funciones.

### Detalles

- **Material solo cuando hace falta.** `needsMaterial` (reglas) decide si el turno necesita el texto; `pickFiles` elige el archivo que nombra el alumno («el de la célula», «el segundo»), si no los que encuentra la búsqueda de texto completo de Postgres (`textSearch` en español) y si no la última tanda subida. Fotos: se reenvía el texto extraído al subirlas, nunca la imagen.
- **Archivo subido dos veces:** cuenta una vez y el índice dice «(subido 2 veces)».
- **Reintento por «súbeme el archivo».** Con archivos en la conversación, la respuesta se revisa antes de enseñarla (`asksToReupload`); si pide volver a subirlo o dice que no lo tiene, se rehace con el material y `REUPLOAD_NOTE`. Si la segunda también lo pide, sale una frase fija que no lo pide.
- **Router (`chat_route`).** Solo para mensajes cortos, con referencias o que piden crear algo (`routeCandidate`). Las reglas resuelven los casos claros (incluido «un juego» con algo pendiente en la pizarra, «sí»/«ahí lo tienes», «otro»). El modelo (Qwen, `reasoning_effort: none`, temperatura 0, salida estructurada con «no_consta») solo cuando el mensaje es corto y vago o tiene referencias. Si el modelo falla, se sigue como chat. Si pide algo, es **una sola pregunta** que nunca pide un archivo de la lista.
- **Dreams sin archivo en el mensaje:** `scheme_generate`, `game_generate` y `test_generate` usan los archivos de la conversación. «Necesito tus apuntes» solo sale cuando la conversación no tiene ninguno.

## Bloque 4 · Presupuesto y contabilidad

- Índice + pizarra: **76–200 tokens** por turno en el banco (tope de diseño: índice de 8 archivos y pizarra de 700 caracteres ≈ 200 tokens). Van como mensajes de sistema, así que **no cuentan en el cupo del alumno** (`studentInputTokens` no suma el sistema). El router tampoco: no pasa por la admisión del alumno.
- Router con IA: 365–610 tokens de entrada, solo cuando las reglas no bastan («hazlo con eso», «dale», «¿y de la célula?» tras un Dreams).
- Por turno se registra `dream_memory_turn` (archivos, tokens de índice y pizarra, material sí/no, reintento) y por decisión `chat_route` (reglas o IA, intención, si preguntó, tokens del router, ms). Sin texto.
- **Panel interno → «Memoria del chat (14 días)»**: turnos, % con archivos, % con material, respuestas rehechas, decisiones del router (con IA), preguntas, Dreams, tokens de índice + pizarra por turno y del router. Tabla `dream_private.chat_memory_daily`, solo totales por día.
- Fundación Loyola: sin cambios (sin límite diario, solo el tope por minuto).

## Bloque 5 · Pruebas de regresión (claves reales)

`scripts/memoria/banco.mjs` reproduce cada turno con los módulos reales de dream-api (`chatSystemMessages`, `compactHistory`, router, pizarra, índice) y llama a Groq con las claves del proyecto a través de una función temporal con llave de un solo uso (`dream-memoria-banco`, desactivada al terminar). Corre cada conversación «antes» y «después». Transcripciones y tokens por turno: [`docs/memoria-chat/banco-2026-10-27.md`](memoria-chat/banco-2026-10-27.md).

**Resultado: después 10 de 10; antes 2 de 5** (las otras 5 solo se pasaron «después»). Tras ajustar el router se repitió «después»: otra vez **10 de 10** ([`banco-2026-10-27-final.md`](memoria-chat/banco-2026-10-27-final.md)).

**Router con IA** (los casos que las reglas no resuelven): **10 de 10** tras una corrección («para practicar» = juego; la primera pasada dio 9 de 10 porque preguntaba el tipo). Resultados: [`router-2026-10-27.md`](memoria-chat/router-2026-10-27.md).

| | Conversación | Después |
|---|---|---|
| 1 | El caso de Carlos en un mensaje → tarjeta de juego de clasificar | bien |
| 2 | El caso real en dos mensajes: «genérame un Dreams» → pregunta el tipo → «un juego» → tarjeta (antes: «necesito tus apuntes») | bien |
| 3 | La misma petición tras 10 mensajes de charla | bien |
| 4 | «hazme un juego con eso» sin ningún archivo → pide los apuntes, no inventa | bien |
| 5 | Dos archivos y pide el de la célula por su nombre (test y pregunta) | bien |
| 6 | Cambia de tema y vuelve a los apuntes | bien |
| 7 | Sube el mismo archivo otra vez → se reconoce y hace el esquema | bien |
| 8 | Chat de 34 mensajes: recuerda la primera petición («preparar el examen de sintagmas del viernes») y hace el juego con el adjunto | bien |
| 9 | Modo Rápido: Dreams sin tipo, «un juego» y una duda después | bien |
| 10 | Pregunta sobre los apuntes dos turnos después de subirlos (antes: no los usaba) | bien |

## Sin verificar

- El banco reproduce la lógica de `index.ts` con sus módulos, pero no pasa por la función desplegada (no se puede sin una cuenta de alumno de prueba): falta probarlo en producción con una conversación real.
- Las tarjetas Dreams del banco son simuladas (la creación del juego/esquema ya estaba probada); se comprueba qué archivos recibiría.
- La búsqueda de texto completo de Postgres solo se ha probado en el código (en el banco se eligió el archivo por nombre o por la última tanda).
- La idea de «Pull» (índice de una línea por turno y recuperar turnos completos) no se ha adoptado: con la pizarra y el resumen de turnos antiguos que ya existía, el chat de 34 mensajes recuerda la primera petición. Queda para cuando haya chats más largos que lo necesiten, probándolo antes con conversaciones de Dream.
