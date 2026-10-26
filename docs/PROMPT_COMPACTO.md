# Prompt compacto (Bloque 2 quater, punto 2): propuesta, NO en uso

`supabase/functions/dream-api/prompt-compact.mjs` es una versión de
`DREAM_SYSTEM_PROMPT` de **1.556 tokens** (Qwen3; 1.314 en gpt-oss) frente a
**3.152** del original. Ahorra ~1.600 tokens en **cada** mensaje de Normal: es la
medida que más alarga el cupo gratis de Groq (ver docs/LIMITE_USO.md).

**No sustituye a nada.** Solo se usa en `evals/comparar-modelos.mjs --compact`.
Cambiar el prompt de Carlos necesita su OK y que los evals no empeoren (duda 2).

## Reglas conservadas (sección del original → dónde está en la compacta)

| Original | Regla | Compacta |
|---|---|---|
| Cabecera | Asistente generalista; adapta su ayuda en lo educativo | [0] |
| 1 | Identidad y tono (claro, natural, sin infantilizar, sin emojis ni frases vacías) | IDENTIDAD |
| Prioridad alta | Una unidad de comprensión por respuesta, una pregunta y espera; sin simular progresión; material largo → primer bloque; falla/acierta/domina; excepción de resumen o teoría completa | ENSEÑAR ENTRE TURNOS |
| 2 | Pensamiento crítico: premisas, alternativas, corregir con respeto, admitir incertidumbre, no llevar la contraria | PENSAMIENTO CRÍTICO |
| 3 | Razonamiento interno sin revelarlo | RAZONAMIENTO |
| 4, 5 | Detectar contexto educativo sin anunciarlo; comprender, no acabar antes; no convertirlo en negativas | CONTEXTO EDUCATIVO |
| 6 | Deberes: nunca respuesta final, opción, hueco, solución ni desarrollo copiable | DEBERES |
| 7 | Método de ayuda progresiva en 8 pasos; seguir desde lo que ya hizo | DEBERES |
| 8 | Ejemplo análogo con otros datos | DEBERES |
| 9 | Revisar intentos sin sustituirlos | DEBERES |
| 10, 25, 26 | Preguntas conceptuales con profundidad; claridad; no interrogatorio socrático | PREGUNTAS CONCEPTUALES |
| 11 | Lo creado por Dream sí se corrige y se explica | PRÁCTICA Y TESTS |
| 12, 13 | Elegir la herramienta; cuándo proponer un test; no continuamente | PRÁCTICA Y TESTS |
| 14 | Señal `<!--DREAM_ACTION:TEST-->` sin preguntas ni explicación | PRÁCTICA Y TESTS |
| 15 | Test pedido → herramienta; excepción papel | PRÁCTICA Y TESTS |
| 16, 17 | Crear el test a medida y con variedad de tipos | PRÁCTICA Y TESTS |
| 18 | No revelar respuestas durante un test | PRÁCTICA Y TESTS |
| 19, 20 | Corrección completa; feedback sobre el concepto, nunca la capacidad | CORRECCIÓN Y FEEDBACK |
| 21–24, 29 | Memoria académica, dominio conservador, adaptación, incertidumbre | MEMORIA ACADÉMICA Y DOMINIO |
| 30 | Fuera de lo educativo, asistente competente sin forzar estudio | RESPUESTA GENERAL |
| 31 | Regla final | REGLA FINAL |

Se han quitado la repetición, los ejemplos largos y el formato de una palabra por
línea. Los ejemplos de feedback (sección 20) y de incertidumbre (29) quedan en
una línea cada uno. **Cómo comprobarlo**:
`GROQ_API_KEY=… node evals/comparar-modelos.mjs --files tono,tutor,no-inventar`
con y sin `--compact`.
