// Respuesta de IA simulada con la forma EXACTA que pide lessonSystem() (sin
// llamar a ningún modelo). Para pruebas de validación y de dream-api.
const sections = [
  ["Qué fue Bizancio", "El **Imperio bizantino** fue la parte oriental del Imperio romano. Su capital, **Constantinopla**, aguantó mil años más que Roma.", "Constantinopla fue la capital del Imperio bizantino.", true],
  ["Justiniano", "**Justiniano** quiso recuperar el antiguo Imperio. Mandó reunir las leyes romanas en el **Código de Justiniano** y construir Santa Sofía.", "Justiniano mandó construir la Alhambra.", false],
  ["La caída", "En **1453** los otomanos tomaron Constantinopla. Muchos historiadores marcan ahí el final de la Edad Media.", "Constantinopla cayó en 1453.", true],
].map(([title, body, statement, isTrue]) => ({
  title,
  body_markdown: body,
  why_it_matters: "Explica cómo sobrevivió la herencia de Roma.",
  check: { statement, is_true: isTrue, explanation: "Lo dice la sección." },
}));
export const lessonResponse = {
  reading: { sections, sources: ["De tus apuntes"] },
  quiz: [
    { type: "mcq", prompt: "¿Cuál era la capital del Imperio bizantino?", options: ["Roma", "Constantinopla", "Atenas"], answer: "Constantinopla", explanation: "Sección 1.", section_index: 0, difficulty: "facil" },
    { type: "tf", prompt: "Justiniano reunió las leyes romanas.", answer: true, explanation: "El Código.", section_index: 1, difficulty: "facil" },
    { type: "mcq", prompt: "¿Qué edificio mandó construir Justiniano?", options: ["Santa Sofía", "El Partenón", "El Coliseo"], answer: "Santa Sofía", explanation: "Sección 2.", section_index: 1, difficulty: "medio" },
    { type: "tf", prompt: "Constantinopla cayó en 1492.", answer: "false", explanation: "Fue en 1453.", section_index: 2, difficulty: "medio" },
    { type: "written", prompt: "Explica por qué 1453 es una fecha importante.", answer: "Caída de Constantinopla y fin de la Edad Media para muchos historiadores.", rubric: ["Toma de Constantinopla por los otomanos", "Fin de la Edad Media"], explanation: "Dos ideas.", section_index: 2, difficulty: "dificil" },
    { type: "mcq", prompt: "¿Quién tomó Constantinopla?", options: ["Los otomanos", "Los francos", "Los vikingos"], answer: "Los otomanos", explanation: "Sección 3.", section_index: 2, difficulty: "facil" },
    { type: "tf", prompt: "Bizancio era la parte occidental del Imperio.", answer: false, explanation: "Oriental.", section_index: 0, difficulty: "facil" },
    { type: "written", prompt: "¿Qué quería Justiniano?", answer: "Recuperar el Imperio y ordenar las leyes.", rubric: ["Recuperar el antiguo Imperio", "Reunir las leyes"], explanation: "Sección 2.", section_index: 1, difficulty: "medio" },
    { type: "mcq", prompt: "¿Cuánto duró Constantinopla más que Roma?", options: ["Cien años", "Mil años", "Diez años"], answer: "Mil años", explanation: "Sección 1.", section_index: 0, difficulty: "medio" },
  ],
  cards: Array.from({ length: 10 }, (_, i) => ({ front: `Concepto ${i + 1} de Bizancio`, back: `Idea clave ${i + 1}.`, section_index: i % 3 })),
};
