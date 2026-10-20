const SUBJECTS = [
  ['Matemáticas', /matem[aá]tic|[áa]lgebra|ecuaci[oó]n|fracci[oó]n|ra[ií](?:z|ces) cuadrad|geometr|trigonom|funci[oó]n|c[aá]lculo|probabilidad|estad[ií]st|longitud|capacidad|masa|cent[ií]metr|kil[oó]metr|litros?|gramos?/i],
  ['Física', /f[ií]sica|fuerza|velocidad|aceleraci[oó]n|energ[ií]a|newton|cinem[aá]tica/i],
  ['Química', /qu[ií]mica|[áa]tomo|mol[eé]cula|estequiometr|reacci[oó]n|enlace|elemento qu/i],
  ['Biología', /biolog|c[eé]lula|gen[eé]tica|mitosis|meiosis|ecosistema|fotos[ií]ntesis/i],
  ['Historia', /historia|revoluci[oó]n|guerra|imperio|edad media|siglo|acontecimiento/i],
  ['Geografía', /geograf|territorio|poblaci[oó]n|relieve|clima|demograf/i],
  ['Filosofía', /filosof|tesis|premisa|argumento|epistemolog|[eé]tica/i],
  ['Economía', /econom|oferta|demanda|inflaci[oó]n|inter[eé]s|productividad|mercado/i],
  ['Programación', /programaci[oó]n|c[oó]digo|javascript|typescript|python|algoritmo|bug|funci[oó]n\s*\(/i],
  ['Tecnología e informática', /inform[aá]tica|hardware|software|sistema operativo|redes?|tecnolog/i],
  ['Lengua y literatura', /lengua|literatura|sintaxis|morfolog|ortograf|redacci[oó]n|poema|novela/i],
  ['Inglés', /ingl[eé]s|english|present perfect|past simple|vocabulary|grammar/i],
  ['Francés', /franc[eé]s|fran[cç]ais|pass[eé] compos[eé]/i],
  ['Música', /m[uú]sica|armon[ií]a|ritmo|acorde|partitura/i],
  ['Educación artística', /arte|dibujo|pintura|composici[oó]n visual|escultura/i],
];

export function resolvePedagogicalPace(prompt, priorMessages = [], explain = false, test = false) {
  if (test) return 'activity';
  if (/no (?:lo )?entiendo|no lo pillo|me he perdido|m[aá]s (?:f[aá]cil|sencillo)|de otra (?:forma|manera)|reformula|otra analog[ií]a/i.test(prompt)) return 'reframe';
  if (/^(?:vale,? )?(?:contin[uú]a|sigue|siguiente|ya lo entiendo|lo tengo|entendido)\.?$/i.test(prompt.trim())) return 'advance';
  if (/explicaci[oó]n completa|expl[ií]ca(?:me)? todo|todo sobre|resumen completo|de principio a fin|todos los pasos/i.test(prompt)) return 'overview';
  const lastAssistant = [...priorMessages].reverse().find(message => message.role === 'assistant')?.content || '';
  const looksLikeCheckAnswer = lastAssistant.includes('?')
    && prompt.trim().length <= 240
    && !/explica|qu[eé] es|c[oó]mo funciona|hazme|ay[uú]dame|resuelve/i.test(prompt);
  if (looksLikeCheckAnswer) return 'check';
  return explain ? 'foundation' : 'general';
}

export function selectEducationalSkills(prompt, priorMessages = [], educationMode = true) {
  const context = [...priorMessages.slice(-4).map(message => message.content), prompt].join('\n');
  const subject = SUBJECTS.find(([, pattern]) => pattern.test(context))?.[0] || 'General';
  const improve = /corrige|revisa|mejora|qu[eé] est[aá] mal|mi respuesta|mi ejercicio|mi texto|he hecho|debug/i.test(prompt);
  const paperTest = /\b(test|quiz|examen|practic(?:ar|a)|preguntas)\b/i.test(prompt) && /\b(en papel|para imprimir|imprimible|en (?:mi )?cuaderno|en una hoja|no (?:lo )?quiero interactivo)\b/i.test(prompt);
  const test = !paperTest && /\b(test|quiz|examen|practic(?:ar|a)|hazme preguntas|ponme preguntas|preg[uú]ntame)\b/i.test(prompt);
  const explain = /explica|no entiendo|qu[eé] es|c[oó]mo funciona|por qu[eé]|ay[uú]dame|resuelve/i.test(prompt) || (educationMode && !test);
  const skills = [];
  if (subject !== 'General') skills.push('EXPERTO_EN_ASIGNATURAS');
  if (improve) skills.push('MEJORAR');
  if (explain) skills.push('EXPLICAR');
  if (test || /ejercicio|paso a paso|f[oó]rmula|tabla|c[oó]digo/i.test(prompt)) skills.push('EXPERIENCIA_EDUCATIVA');
  return {
    subject,
    skills,
    testIntent: test,
    testMode: /\bexamen\b/i.test(prompt) ? 'exam' : 'practice',
    paperTest,
    pacing: resolvePedagogicalPace(prompt, priorMessages, explain, test),
  };
}

export function educationalSkillPrompt(selection, academicLevel) {
  const instructions = [];
  if (selection.skills.includes('EXPLICAR')) instructions.push(`EXPLICAR: en enseñanza inicial, una respuesta contiene una sola unidad de comprensión. Explica el núcleo inmediato, con como máximo un ejemplo breve. Si el siguiente paso depende de comprender el actual, formula UNA comprobación y termina la respuesta para esperar al estudiante. Si no entendió, reformula con otra analogía o divide más; no repitas ni avances. Solo desarrolla el tema completo cuando el usuario lo pida explícitamente.`);
  if (selection.skills.includes('MEJORAR')) instructions.push(`MEJORAR: conserva la voz y el nivel del estudiante. Indica primero un acierto concreto. Prioriza error factual, conceptual y de razonamiento antes que estilo. Localiza dónde está el primer error, explica por qué y ofrece una corrección o una pista progresiva. No reemplaces todo el trabajo si basta una mejora localizada.`);
  if (selection.skills.includes('EXPERTO_EN_ASIGNATURAS')) instructions.push(`EXPERTO (${selection.subject}): usa la metodología propia de la materia. Matemáticas: Datos → Qué buscamos → Método → Procedimiento → Resultado → Comprobación. Física: Fenómeno → Concepto → Fórmula con variables/unidades → Cálculo → Interpretación. Química: Datos → Conversión → Fórmula → Operación → Resultado. Biología: Estructura → Función → Proceso → Consecuencia. Historia: Contexto → Causas profundas/inmediatas → Acontecimiento → Consecuencias a corto/largo plazo. Idiomas: significado, estructura, uso, ejemplos, excepciones y diferencia entre corrección y uso natural. Programación: Problema → Lógica → Algoritmo → Código → Prueba → Depuración. No inventes datos; declara incertidumbre real.`);
  if (selection.skills.includes('EXPERIENCIA_EDUCATIVA')) instructions.push(`EXPERIENCIA EDUCATIVA: estructura en bloques breves. Para fórmulas usa exclusivamente LaTeX delimitado: \\( ... \\) en línea y \\[ ... \\] en bloque; nunca bloques de código ni LaTeX sin delimitadores. En procedimientos, separa cada transformación importante. Una sola comprobación puede ir en chat. Para 2–5 preguntas usa la herramienta de test mediante la señal definida por el sistema; nunca escribas un mini-test en Markdown, salvo petición explícita de papel.`);
  const paceInstructions = {
    foundation: 'RITMO PEDAGÓGICO — INTRODUCIR: en este turno enseña solo el primer bloque lógico y, como máximo, un ejemplo breve. Si el usuario pegó varios temas, empieza únicamente por el primero que necesite comprender. No desarrolles los demás apartados, tablas completas, excepciones ni ejercicios. Termina con UNA comprobación corta y detente: la continuación pertenece al siguiente turno.',
    reframe: 'RITMO PEDAGÓGICO — REFORMULAR: no avances de tema. Explica la misma idea con palabras más sencillas o una analogía distinta, añade como máximo un ejemplo pequeño y haz UNA comprobación breve. No repitas la explicación anterior ni introduzcas el siguiente bloque todavía.',
    check: 'RITMO PEDAGÓGICO — REVISAR RESPUESTA: valora primero lo que acaba de responder el estudiante. Si hay un error, corrige solo esa confusión y deja que lo intente otra vez. Si lo ha entendido, introduce únicamente el siguiente paso conceptual. No reinicies ni completes toda la lección.',
    advance: 'RITMO PEDAGÓGICO — AVANZAR: conecta con lo ya comprendido y desarrolla solo el siguiente paso lógico. No saltes varios bloques ni encadenes ejercicios. Cierra con una comprobación breve solo si aporta valor.',
    overview: 'RITMO PEDAGÓGICO — MAPA GENERAL: ofrece primero un mapa corto del tema para orientar. Desarrolla únicamente el primer bloque esencial y deja claro cuál sería el siguiente; no conviertas el turno en una lección completa con todos los puntos y ejercicios.',
    activity: 'RITMO PEDAGÓGICO — ACTIVIDAD: sigue el flujo interactivo de la actividad. No vuelques todas las preguntas o soluciones en el chat.',
    standard: '',
  };
  if (paceInstructions[selection.pacing]) instructions.push(paceInstructions[selection.pacing]);
  return `Skills activas para esta petición: ${selection.skills.join(' + ') || 'conversación general'}. Asignatura detectada: ${selection.subject}. Nivel conocido: ${academicLevel || 'no indicado'}.
${instructions.join('\n')}`;
}

