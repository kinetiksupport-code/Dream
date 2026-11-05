# Apuntes (apuntes pasados a limpio)

El alumno sube sus apuntes (foto, PDF, Word o texto pegado) y Dream le devuelve **sus mismos apuntes pasados a limpio**, como una hoja de cuaderno: título subrayado, apartados numerados con el subtítulo resaltado en amarillo y el periodo entre paréntesis, viñetas cortas con el término en negrita, un esquema de 3-5 cajas con flechas, un recuadro «Idea clave» y número de página. El estilo es el del ejemplo de Carlos (decisión del 4/11/2026): no hay otro.

**Regla de oro: fiel a sus apuntes.** Dream ordena, acorta, corrige faltas y da formato. No añade ningún dato que no esté en los apuntes, aunque sea cierto.

## Cómo se reparte el trabajo

| Quién | Qué hace | Dónde |
| --- | --- | --- |
| Qwen (Groq) | Solo el **contenido** en JSON: título, apartados, viñetas con cita literal, cajas, idea clave, trozos ilegibles y datos dudosos. | `NOTES_PROMPT`, `notesMessages` en `supabase/functions/dream-api/clean-notes.mjs` |
| Validador | Cada viñeta lleva una **cita literal** de los apuntes. Sus cifras, fechas, números romanos y nombres propios tienen que estar en esa cita, y su texto tiene que salir de los apuntes (≥ 60 % de sus palabras). Si no, se quita la viñeta. Las cajas y la idea clave solo pueden usar datos que ya estén en las viñetas. Si se deja fechas de los apuntes, se le pide que las ponga. Un reintento con los errores. Si vuelve a fallar, se arregla **quitando** (nunca añadiendo). | `validateNotesPage`, `generateNotesPage` |
| Código de Dream | La hoja: renglones con CSS, resaltado «a rotulador», cajas (en vertical en móvil), claro y oscuro, PDF y PNG. Letra Kalam autoalojada con `next/font`. | `components/apuntes-limpios/` |

## Entradas

- **Chat:** «pásame a limpio estos apuntes», «pon en limpio mis notas», «ordena mis apuntes» (`wantsCleanNotes` en `lib/clean-notes.ts`). Usa los archivos del mensaje o los que ya subió en la conversación. Sin apuntes, los pide sin gastar cupo.
- **Tarjeta del archivo en el chat:** botón **«Apuntes»** junto a «Esquema de estos apuntes».
- **Pantalla Apuntes (`/notes`):** botón **«Apuntes»** en cada archivo listo, junto a «Resumir» y «Crear test». Lleva a la hoja.
- **Subida por QR:** el archivo llega al chat como cualquier otro, con su tarjeta y el botón «Apuntes».

Propuesta para no confundir el botón con la pantalla «Apuntes» (sin renombrar nada): el botón dice «Apuntes» con la etiqueta accesible «Apuntes: pasar este archivo a limpio» y, mientras trabaja, «Pasando a limpio…». La tarjeta del chat dice «Dreams · Apuntes» y en Dreams hay un filtro «Apuntes».

## Servidor (dream-api)

- `notes_clean_generate`: con conversación (chat) o solo con `attachment_ids` (pantalla Apuntes). Junta el texto de los archivos, lo trocea en páginas de ~3.000 caracteres por apartados (`notesPages`, máx. `NOTES_MAX_PAGES` = 6) y genera **la primera página**. Guarda en `dream_clean_notes` y responde con la tarjeta `<!--DREAM_WIDGET:{"type":"notes",…}-->`.
- `notes_clean_page`: la página siguiente, una por llamada y en orden. La pantalla las pide solas y el alumno las ve aparecer. No gasta cupo.
- `notes_clean_get`: solo para su dueño.
- **Cupo:** cuenta como un test (`ADMISSION_OPERATION`). Si falla o ya estaba hecho, se devuelve el cupo (`refundQuota`). Fundación Loyola sin tope diario, solo el límite por minuto.
- **Caché:** `cache_key` = SHA-256 de la versión del prompt + el texto de los apuntes, por alumno. Si pide otra vez lo mismo, no se gasta IA.
- **Fotos:** se leen una sola vez al subirlas (el texto queda en `dream_attachments`). El OCR ahora marca `[ilegible]` en vez de adivinar, y el alumno ve «No he podido leer X trozos de la foto: revísalos».
- **Datos dudosos:** si un dato de los apuntes parece mal, Dream lo avisa sin cambiarlo («Revisa estos datos de tus apuntes»).
- **Registros:** solo cifras (`notes_clean_page`: página, intentos, viñetas quitadas, datos que faltaban), nunca contenido.
- **Datos:** `supabase/migrations/20261104090000_clean_notes.sql`. Solo el resultado validado, nunca los apuntes. RLS sin políticas, sin permisos para anon/authenticated, se borra con la cuenta.

## Tokens

Groq gratis: ~8.000 tokens/min por clave. Una página ≈ 2.000-2.500 tokens a la primera (≈ 1.000 de apuntes + ≈ 700 de instrucciones + la salida, con `max_tokens` 1.800, temperatura 0,2, sin razonamiento y sin ejemplo). Con reintento, ≈ 5.000-6.000.

## Banco de pruebas (Bloque 0)

```bash
node scripts/apuntes/fotos.mjs                     # fotos de prueba a mano (sin datos personales)
GROQ_API_KEY=… node scripts/apuntes/banco.mjs --example ambos
DREAM_STYLE_LAB=1 npx next start -p 3111           # /apuntes-muestra (404 en producción)
```

Resultados en `docs/apuntes-limpios/RESULTADOS-BANCO.md`.

## Pruebas

`tests/apuntes-limpios.test.ts`: dato inventado → se quita; cita que no existe → se quita; frase nueva con cita real → se quita; cajas con un dato nuevo → error y en el arreglo se quitan; idea clave con un nombre nuevo; fechas que faltan; troceo; caché; detector del chat; tarjeta.
