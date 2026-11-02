# Ruta de estudio · Entrega 1: datos y servidor

Prompt de la ruta, Bloques 7 y 8. **No se ha aplicado nada en Supabase ni se ha
desplegado.** Todo va detrás de `DREAM_STUDY_STEPS_ENABLED`, que en el servidor
es un secreto de `dream-api`. Si no existe o no es `true`, estas acciones
responden 404.

## Datos (migración `20261102090000_study_steps.sql`)

La migración solo **añade**: no borra ni cambia nada de lo que existe. La
marcha atrás está al principio del archivo.

| Tabla | Para qué |
| --- | --- |
| `dream_unit_content` | La lección generada de cada unidad: lectura y banco de preguntas. Lleva estado, dificultad, tokens estimados y un candado para no generarla dos veces a la vez. |
| `dream_unit_progress` | Sección por la que va, lectura terminada, mejor resultado del test, «Dominado» y cómo le ha resultado. |
| `dream_cards` | Tarjetas con el estado del repaso espaciado (FSRS), el origen (`ai`, `mistake`, `own`, `import`), si están ocultas y si se han reportado. Tope: 500 por examen y 2.000 por alumno (trigger). |
| `dream_card_reviews` | Cada repaso una sola vez (`review_id` único), también los hechos sin conexión. |
| `dream_error_bank` | Los fallos del examen: pregunta, tema, causa y si el alumno la ha confirmado. |
| `dream_exam_blueprints` | El plano del simulacro final (se usará en la Entrega 4). |
| `dream_exam_sessions` (columnas nuevas) | `kind` (diagnóstico, bloque o final), `blueprint_id`, `estimated_grade` y `grading`. |
| `dream_private.study_limits` | Los topes, en un solo sitio: 6 lecciones nuevas al día, 2 simulacros por examen y día, y los topes de tarjetas. |

- **Privacidad.** RLS con `student_id = auth.uid()`: el alumno solo **lee** lo
  suyo y solo escribe `dream-api`. Nadie ve datos de otro alumno, ni siquiera
  agregados. Al borrar la cuenta se borra todo, en cascada.
- **Topes.** Los calcula `dream_study_quota(alumno, 'lesson' | 'mock', examen)`,
  que solo puede llamar `dream-api`.
  - Las lecciones fallidas no cuentan.
  - El día se cuenta con la hora de Madrid.
  - Fundación Loyola no tiene tope diario (usa `is_special_account`).

## Acciones nuevas de `dream-api` (`study.ts`)

| Acción | Qué hace |
| --- | --- |
| `unit_content_get` | La primera vez que se abre, genera la lección: una sola llamada que devuelve lectura, preguntas y tarjetas. La valida (`lesson.mjs`) y, si sale mal, reintenta una vez. Si vuelve a fallar, devuelve «No hemos podido preparar esta lección. Reintentar» y no se cobra. Las siguientes veces la devuelve guardada, sin IA. Al navegador nunca le llegan las respuestas. |
| `unit_progress_save` | Guarda la sección, el «cómo lo noto» y la mini-pregunta V/F, que corrige el servidor después de que el alumno conteste. |
| `cards_due` | Tarjetas pendientes de todos los exámenes, primero las del examen más cercano. |
| `card_review` | Programa el siguiente repaso con FSRS en el servidor. Si llega el mismo `review_id` dos veces (repasos sin conexión), no cuenta doble. |
| `card_create` · `card_update` · `card_delete` · `cards_import` · `card_report` | Tarjetas propias, de hasta 300 caracteres por cara; importación de hasta 500 filas; reportar una tarjeta la oculta. |
| `error_bank_list` | Los fallos de un examen. |
| `study_quota` | Cuántas lecciones lleva hoy y cuántas le quedan. |

Las acciones del simulacro (`exam_blueprint_get`, más tipos de pregunta y la
corrección con rúbrica) llegan con la Entrega 4.

### Qué recibe la IA

Solo el tema, la asignatura, el curso, el objetivo de la unidad, la dificultad
y los párrafos de **sus apuntes** que tratan esa unidad. Se eligen sin IA y con
un tope de unos 1.500 tokens. Nunca recibe el nombre, el correo ni
conversaciones (hay una prueba que lo comprueba). En los registros solo
quedan contadores, nunca texto de lecciones, respuestas ni tarjetas.

### Repaso espaciado (`srs.mjs`, también en `lib/srs.ts`)

- FSRS-5 de implementación propia, sin dependencias nuevas, con los
  parámetros por defecto y retención del 90 % (ajustable entre 80 y 95 %).
- «Otra vez» vuelve en 10 minutos; «Difícil», «Bien» y «Fácil» dan intervalos
  crecientes.
- La web usa la misma función para escribir debajo de cada botón cuándo
  volverá la tarjeta.

## Tokens y cuántas lecciones caben al día

- **Entrada:**
  - instrucción de unos 500 tokens;
  - contexto de 150 tokens sin apuntes, y de hasta unos 1.700 con los apuntes
    al tope;
  - total: **≈ 2.200 como mucho**. El objetivo es ≤ 4.000.
- **Salida:** limitada a **3.500** (`max_tokens`). Por la forma del JSON, se
  estima que una lección completa ocupa unos 2.500.
- **Total:** ≈ 4.700 tokens por lección, de media.
- **El cupo gratis de Groq** es de unos 200.000 tokens al día por modelo,
  compartidos entre todos los alumnos y con el chat. Si no hubiera nada más,
  cabrían **unas 40 lecciones nuevas al día entre todos**.
- **Propuesta.** Mantener 6 al día por alumno como tope, y vigilar el gasto
  real la primera semana. Si hubiera muchos alumnos, el tope global lo
  marcaría Groq: la cola de la IA ya avisa.
- Estas cifras son estimaciones (caracteres ÷ 3,6). Las reales las da
  `scripts/ia/leccion-humo.mjs` con una clave.

## Pruebas

| Prueba | Qué comprueba | Resultado |
| --- | --- | --- |
| `scripts/security/study-integration.mjs` (Postgres local, dos alumnos) | RLS en las 6 tablas; anon no lee; el alumno no escribe nada (ni lo suyo); una lección por unidad; no se enlazan datos de otro; tope de 6 (las fallidas no cuentan); Loyola sin tope; 2 simulacros por examen y día; tope de tarjetas y de 300 caracteres; repaso único; borrar la cuenta lo borra todo y no toca al otro alumno | ✓ |
| `supabase/tests/study_deno.mjs` (dream-api real, IA y Supabase simulados) | Genera la lección una vez y la guarda; no envía las respuestas; tope de salida; sin datos personales; con sus apuntes; sin contenido en los registros; JSON malformado → reintento → «Reintentar» sin cobrar; sin cupo no se llama a la IA; la lección de otro alumno no existe; V/F corregida en el servidor; FSRS sin duplicados; crear, editar, importar, reportar y borrar; flag apagado = 404; IA saturada → la lección no queda bloqueada | ✓ 8/8 |
| `tests/leccion.test.ts`, `tests/srs.test.ts` | Validación del JSON, filtro de soluciones en las tarjetas, apuntes de la unidad, test de 6-8 preguntas y umbral del 80 %; FSRS: intervalos, reinicio con «Otra vez», retención y textos | ✓ |

## Lo que no se puede probar sin la IA y la nube reales

Esto queda pendiente de comprobar en producción:

- La calidad real de las lecturas, las preguntas y las tarjetas de Qwen, y si
  la lectura inventa algo.
- El gasto real de tokens y el tiempo de respuesta de Groq.
- RLS con la configuración real de Supabase, y las Edge Functions con sus
  secretos.

**Listo para ejecutar con una clave:**

```
GROQ_API_KEY=… node scripts/ia/leccion-humo.mjs
```

Genera lecciones de 10 temas de ESO y Bachillerato y da:
- el % de lecciones válidas a la primera;
- el % de preguntas tipo test que se contestan con la lectura;
- el % de tarjetas que no resuelven ejercicios;
- los tokens reales.

## Textos legales (para Carlos; no se han cambiado)

Habría que añadir a la política de privacidad que Dream guarda las lecturas,
las tarjetas, los repasos, el banco de errores, los planos del examen, los
simulacros y las notas estimadas, y que la nota y las preguntas probables son
estimaciones.

## Primeras comprobaciones en producción (cuando digas «a producción»)

1. Aplicar la migración, con un punto de restauración antes.
2. Desplegar `dream-api` con el flag apagado: comprobar que las acciones
   responden 404.
3. Encender el flag solo para una cuenta de prueba.
4. Abrir una lección y comprobar que se genera en menos de 60 s, que está bien
   escrita y que en el registro `lesson_ready` los tokens están por debajo de
   4.000 de entrada y 3.500 de salida.
5. Contestar la mini-pregunta y repasar una tarjeta: comprobar la fecha del
   siguiente repaso.
6. Desde otra cuenta, comprobar que no se ve nada de la primera.
