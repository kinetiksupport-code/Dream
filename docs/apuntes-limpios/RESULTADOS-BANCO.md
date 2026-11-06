# Banco de pruebas de «Apuntes» (Bloque 0), 4-5/11/2026

Modelo `qwen/qwen3.8-27b` en Groq, temperatura 0,2, sin razonamiento, `json_schema`, sin ejemplo en el prompt. Se ejecutó con una función temporal de Supabase (`apuntes-banco`, código en `docs/apuntes-limpios/funcion-banco.ts.txt`) que usa las claves del proyecto sin exponerlas; desactivada al terminar. Resultados en `evals/apuntes-limpios/resultados/`.

Casos: los 10 apuntes de `evals/esquemas/apuntes/` y 3 fotos de apuntes a mano (`evals/apuntes-limpios/fotos/`, generadas con letra manuscrita sobre hoja de cuaderno, sin datos personales). **Faltan fotos reales de Carlos** para medir el OCR con letra de verdad.

## Resumen

| Tanda | Cambios | Válidos | Con datos añadidos | Con ideas perdidas | Tokens/página |
| --- | --- | --- | --- | --- | --- |
| 1 (con y sin ejemplo, 26) | primera versión | 24/26 | 0 | 6 (fechas e ideas) | 3.406 |
| 2 (13) | título obligatorio, más salida, ideas perdidas en el reintento | 13/13 | 0 | 6 | 4.767 |
| 3 (13) | citas cortas, sin la descripción de la foto, lo perdido vuelve tal cual | 12/13 (1 fallo del proveedor, repetido sale bien) | 0 | 1 (por un fallo al partir «s. XVIII», arreglado) | 4.645 |
| 4 (5 afectados) | cada frase recuperada en su apartado y orden, sin términos repetidos | 5/5 | 0 | 0 (salvo «1126», arreglado después) | 4.664 |

**Criterio (≥ 9/10 sin ningún dato añadido y sin perder ninguna idea principal): se cumple.** Desde texto, 10/10 sin datos añadidos y sin ideas principales perdidas (revisión a mano de la tanda 3, más la 4 en los casos corregidos). Fotos de prueba, 3/3 con OCR del 98-100 %.

## Revisión a mano (tanda 3 + 4)

- **Ningún dato inventado** en los 13: todas las fechas, cifras y nombres están en los apuntes. Algunas viñetas reformulan un poco («Embalses y presas para generar energía»), sin datos nuevos.
- **Faltas corregidas:** «Revolucion» → «Revolución», «Almoravides» → «Almorávides», tildes de las fotos.
- **Cajas e idea clave:** en 12 de 13 hay cajas con flechas (3-5), solo con datos de las viñetas. Las cajas con datos nuevos («Reino nazarí 1238-1492» cuando no estaba en las viñetas) las quita el validador.
- **Fallos que encontró el banco y ya están arreglados:** título vacío en al-Ándalus; idea clave con palabras que no estaban en los apuntes; descripción de la foto mezclada con los apuntes; citas de 2-3 palabras en listas; «Combustibles fósiles» recuperado bajo «Renovables»; «Causas: Causas:»; «España 2023 (2023)»; «1870-»; la frase larga del legado cortada antes de «1126».
- **Un fallo del proveedor:** en una llamada Groq devolvió los caracteres con tilde como basura (`\x7f`). Las citas no casaban, el validador lo tiró todo y el alumno vería «No he podido pasar a limpio…» sin gastar cupo. Al repetirlo salió bien.

## Gasto

- Apuntes normales: ~2.100 tokens si sale a la primera y ~4.000-6.000 con reintento (la mayoría reintenta porque el validador pide las ideas o fechas que faltan). Media: **~4.650 tokens por página** (objetivo ≤ 5.000).
- Apuntes muy densos (al-Ándalus, 15 fechas en 2.600 caracteres): ~9.000 con reintento.
- La caché evita gastar otra vez con los mismos apuntes.
- Con ejemplo corto en el prompt (tanda 1): +300 tokens y la misma calidad. Se queda **sin ejemplo**.
