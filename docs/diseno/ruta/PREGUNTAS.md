# Cómo preguntar en las lecciones (investigación del 3-nov-2026)

Carlos pidió mirar cómo plantean las preguntas otras apps de estudio (Knowunity, Quizlet, Brilliant, Duolingo) y qué dice la investigación, y añadir lo útil. Resumen y decisiones:

| Qué se ha visto | Fuente | Qué hace Dream |
| --- | --- | --- |
| Knowunity mezcla tipo test, verdadero/falso, huecos y más; ajusta la dificultad | [Knowunity · quizzes](https://ie.knowunity.com/ai/quizzes) | Cada lección mezcla mcq, V/F, respuesta escrita y, en materias de cálculo, numérica; ordenadas de fácil a difícil |
| Quizlet «Aprender» combina escrita, emparejar, test y V/F, y no da por sabido un término hasta acertarlo dos veces | [Quizlet · ayuda](https://help.quizlet.com/hc/articles/360030986971) | Ronda «Repasemos las preguntas que fallaste»: vuelven hasta acertarlas |
| Brilliant: idea corta (2-4 frases) y enseguida un problema, de lo simple a lo complejo, con corrección inmediata | [Cómo enseña Brilliant](https://brilliant.org/resources/choosing-brilliant/how-brilliant-teaches-math/) | Tarjetas «Qué saber» de ≤ 50 palabras y test justo después |
| Ejemplos resueltos y luego pasos que se van quitando (completar el paso) ayudan a quien empieza | [MIT · worked and faded examples](https://openlearning.mit.edu/mit-faculty/research-based-learning-findings/worked-and-faded-examples), [Worked-example effect](https://en.wikipedia.org/wiki/Worked-example_effect) | En mates/física/química: un ejemplo resuelto en la lectura y preguntas de «¿cuál es el paso siguiente?» y numéricas |
| Las preguntas en negativo («¿cuál NO…?») se desaconsejan en casi todas las guías; las dobles negaciones confunden | [Chiavaroli 2017](https://doi.org/10.7275/ca7y-mm27) | Como mucho una por lección, con el NO en mayúsculas, nunca doble negación |
| «Todas/ninguna de las anteriores» empeoran la pregunta | [The Learning Scientists](https://learningscientists.org/blog/2017/10/10-1?format=amp) | Prohibidas en la instrucción |
| Las opciones competitivas (creíbles) hacen que el alumno piense en todas | [Little y Bjork 2014](https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2017/01/LittleBjorkMC2014.pdf) | Las incorrectas son errores típicos de alumnos, de longitud parecida |
| Decir la respuesta correcta es lo que más ayuda; la explicación suma sobre todo en preguntas abiertas | [Smith 2019](https://uwaterloo.ca/memory-attention-cognition-lab/sites/default/files/uploads/files/smith2019.pdf), [Wang 2019](https://digitalcommons.memphis.edu/facpubs/7824) | La hoja de corrección siempre dice la correcta y una explicación de 1-2 frases; «¿Por qué?» para ir más allá |
| «Selecciona todas las que…» no muestra beneficio claro | [Würzburg (presentación)](https://www.uni-wuerzburg.de/fileadmin/43060000/03B_Bildungsforschung/PSE_Promotionskolleg/Greving/Praesentation_Testing_Paepsy_S_Greving.pdf) | No se añade por ahora |

Implementado en `supabase/functions/dream-api/lesson.mjs` (instrucción y tipo `numeric`, corregido en código con coma o punto y un 0,5 % de redondeo) y en la lección (`components/exams/lesson-flow.tsx`, campo numérico con la unidad).
