# Banco de pruebas de los esquemas (Bloque 0), 26/10/2026

Modelo `qwen/qwen3.8-27b` en Groq, temperatura 0,25, sin razonamiento, salida con `json_schema`, sin ejemplo en el prompt. Se ejecutó con una función temporal de Supabase (`esquemas-banco`, código en `docs/esquemas/funcion-banco.ts.txt`, ya desactivada) que usaba las claves del proyecto sin exponerlas; desactivada al terminar (responde 401/410). Resultados, fuentes y capturas en `evals/esquemas/resultados/`.

## Resumen

| Tanda | Válidos | A la primera | Datos erróneos (revisión a mano) | Nivel visual |
| --- | --- | --- | --- | --- |
| 1 · Desde apuntes (10 temas) | **10/10** | 8/10 (2 fallos eran del validador, ya corregidos) | **0/10** con errores | 10/10 |
| 2 · Solo tema + búsqueda básica (10) | 10/10 | 9/10 | 3/10 con errores o imprecisiones | 6/10 |
| 3 · Búsqueda mejorada (4 temas peores de la 2) | 4/4 | 2/4 | 1/4 (al-Ándalus: cifras discutibles de la fuente) | 4/4 |
| 4 · Búsqueda mejorada, los 10 temas (noche del 27/10) | **10/10** | 9/10 (1 por tamaño, ver abajo) | **2/10** con errores | 8/10 |

**Criterio (≥ 9/10 sin datos inventados y al nivel del ejemplo):** se cumple **desde apuntes (10/10)**. **Solo con el tema se queda en 8/10**: cerca, pero no pasa.

## Lo que dice la revisión a mano

- **Apuntes:** ningún dato falso. Todas las cifras están en los apuntes. Hubo 4 añadidos correctos que no estaban en los apuntes (Kant y el idealismo alemán, por qué los iónicos no conducen en sólido, pie de foto de la Bastilla, «97 %» sin el «alrededor de»).
- **Búsqueda básica:** fuentes malas (YouTube, Facebook, libros en inglés). Errores de atribución que el validador no puede ver porque la cifra sí está en la fuente: «Batalla de Teruel, dic. 1937–nov. 1938» (era una fase «de Teruel al Ebro») y «Batalla del Ebro, jul. 1938–feb. 1939» (era «el Ebro y la toma de Cataluña»). Simplificaciones en Química y Biología («solo los ácidos covalentes conducen en agua», «los ribosomas sintetizan proteínas a partir del ADN»). Esquemas pobres en al-Ándalus y Kant.
- **Búsqueda mejorada** (`search_depth: advanced`, 5 resultados, sin vídeos ni redes, consulta «… apuntes 2.º Bachillerato»): fuentes de apuntes de institutos y academias. Kant y Ecuaciones al nivel de los de apuntes. Al-Ándalus recoge dos cifras discutibles de su fuente (Zaragoza «1119», almohades «1175-1231»).
- **El validador** quitó en total 23 datos con cifras sin cita literal. Varios eran ciertos (Alarcos 1195, Badajoz 1936, Jarama 1937): es prudente a costa de perder algún dato. Uno era dudoso («la producción industrial cayó un 30 %»).

## Tanda 4 (búsqueda mejorada, 10 temas)

- **Con errores (2):**
  - Oraciones: ejemplos que no son oraciones compuestas («Dolor y salida», «O vienes o castigo», «Gusto pero odio»).
  - Enlaces químicos: «los covalentes son más débiles que los iónicos» (falso en general; el diamante es covalente) y una sección de fullerenos fuera de nivel.
- **Imprecisiones que vienen de la propia fuente (no cuentan como inventadas):** Guerra Civil «986 días» (son 987–988), al-Ándalus «arcos de herradura» en el arte nazarí.
- **Bien (8):** al-Ándalus, Revolución Francesa, Guerra Civil, Kant, Fotosíntesis, Ecuaciones, Célula, Ciclo del agua. Al-Ándalus tiene una sección de legado con frases de relleno copiadas de la web.
- **Tamaño:** con 5 resultados largos, Ecuaciones pasó de 7.000 tokens de entrada por minuto (límite de Groq para esta clave) y falló. La fuente se limita ahora a ~10.000 caracteres; repetido, sale bien. **En la función real hay que poner el mismo tope.**

## Gasto

~4.000 tokens por esquema (2.500–13.000; un reintento lo dobla). ~1 llamada por esquema, 1,2 con reintentos. Total del banco: unas 125.000 tokens.

## Cambios hechos a raíz del banco

- Las cifras pegadas a letras (CO2, H2O, x^2) y lo que va entre `$…$` no cuentan como datos.
- En títulos, periodos, resumen e ideas basta con que la cifra esté en la fuente (antes tenía que estar en una viñeta con cita).
- Se quita el año repetido en el texto de las fechas («1085: 1085: …») y «1936-1936» pasa a «1936».
- Matemáticas en línea con KaTeX (`$b^2 - 4ac$`).
- La introducción de cada tarjeta solo si aporta algo (nada de «Definición básica de…»).
- Búsqueda: profundidad avanzada, 5 resultados, sin vídeos ni redes sociales, consulta orientada a apuntes del curso.

## Recomendación

1. Lanzar **«Esquema de estos apuntes»** (pasa el criterio: 10/10 sin datos erróneos).
2. **No lanzar todavía «hazme un esquema de X» sin apuntes** (8/10). Alternativas, de más barata a más cara:
   - Pedir al alumno sus apuntes o una foto del libro antes de hacer el esquema (cero coste, máxima fiabilidad).
   - Una segunda llamada barata (gpt-oss-20b) que compruebe cada viñeta y cada ejemplo contra la fuente y quite lo que no encaje (~+30 % de tokens). Los dos errores de la tanda 4 eran de este tipo.
   - Probar `gpt-oss-120b` solo para el modo sin apuntes (con caché de prompt) en un banco igual.
   - Preferir dominios educativos españoles en la búsqueda.
