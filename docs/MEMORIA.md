# Memoria entre conversaciones e importación de otra IA (bloques 4, 6 y 7)

**Apagada.** Hay dos interruptores y los dos tienen que estar encendidos:

1. `FEATURE_FLAGS.memory` (y `memoryImport` para importar) en
   `supabase/functions/dream-api/features.mjs`. Los dos en `false`. Con el
   interruptor apagado no hay acciones `memory_*` (dan «Acción no válida»), la web
   no enseña la sección de Ajustes ni los pasos de la bienvenida, Dream no habla de
   su memoria y no se inyecta ni se extrae nada.
2. `dream_profiles.memory_enabled`: es **falso hasta que el alumno dice «Sí»**,
   en la bienvenida o en Ajustes.

**Antes de encender**: aplicar `20261029090000_memory.sql` y desplegar dream-api.
Si se enciende sin la migración, el chat sigue funcionando sin memoria, pero las
acciones de Ajustes fallarían.

## Qué guarda y qué no

- **Sí**: qué le cuesta, qué domina, cómo le gusta que le expliquen, objetivos y
  fechas, en qué se quedó. Una frase de 160 caracteres como mucho, en tercera
  persona. Como mucho 40 por alumno; sobran los no fijados más antiguos.
- **Nunca**: salud, emociones, religión, ideología, sexualidad, familia, otras
  personas o sus nombres, contacto, centro educativo, contraseñas, ni lo que pidió
  no recordar («no te acuerdes de esto»: ese mensaje y el anterior ni siquiera
  llegan al extractor). El servidor filtra (`isSafeMemory`) todo lo que devuelve
  la IA, también los nombres propios en mitad de frase. Es preferible perder un
  recuerdo a guardar uno sensible.
- **Caducidad**: 12 meses sin uso (`dream_memory_purge`, a diario con pg_cron si
  está instalado; en este proyecto **pg_cron no está instalado**, así que hay que
  instalarlo o programar la llamada).

## Cómo funciona

- **Extracción**: al abrir una conversación nueva, después de responder (en
  segundo plano), se extrae la anterior si tiene al menos 4 mensajes del alumno.
  Modelo `openai/gpt-oss-20b` con JSON estricto. Tiene su propia admisión: si la
  IA está ocupada, se deja para la siguiente. **No cuenta en la ventana de 5
  horas**, pero sí suma una petición a los topes diarios de Dream.
- **Uso**: al empezar la conversación se calcula el bloque (fijados, luego los de
  la asignatura del mensaje y luego los recientes; hasta 10, más el último
  resumen) y se guarda con la conversación, así el prompt no cambia. Peor caso
  medido: **285 tokens** (≤ 300).
- **Importar de otra IA**: el texto pegado solo pasa por el extractor, delimitado
  y marcado como «dato no fiable». Antes de guardar hay una vista previa
  obligatoria, con «Quitar» en cada línea. El navegador devuelve la lista y se
  valida otra vez. Como mucho 3 importaciones al día. El texto pegado no se guarda
  ni se registra.
- **Bienvenida**: «¿Quieres que Dream recuerde…?» va después del apodo y antes de
  la edad, sin ninguna opción marcada. Si dice que sí, sale «¿Usabas antes otra
  IA?». **La importación se ofrece en «Listo»**, después de aceptar el permiso de
  IA, porque importar envía el texto a la IA. El encargo la ponía antes de la edad;
  eso supondría tratar datos con IA antes del consentimiento.

## Hecho después (26/10/2026)

- Aviso «Dream ha recordado N cosas · Ver» en el chat (contador `memory_unseen`).
- Extracción al volver a abrir Dream cuando la última conversación lleva 30 min quieta.
- «Descargar mis datos» en Ajustes › Privacidad (incluye recuerdos y resúmenes).
- Interruptor encendido (`FEATURE_FLAGS.memory`): cada alumno sigue con la
  memoria apagada hasta que dice «Sí».
- La tabla `dream_conversation_summaries` ya existía en producción (vacía, con
  `owner_id`): la migración la reutiliza.

## Pendiente

- `evals/memoria.json` sin ejecutar contra el modelo (no hay clave de Groq aquí).
