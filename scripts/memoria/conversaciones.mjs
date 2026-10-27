// Conversaciones del banco de la memoria del chat (docs/MEMORIA-CHAT.md,
// Bloque 5). Apuntes inventados para la prueba (sin datos de alumnos).
// `check` decide si salió bien; además, cualquier respuesta que pida volver a
// subir un archivo que ya estaba la suspende.

export const SINTAGMAS = {
  name: 'apuntes-sintagmas.pdf',
  text: `Lengua 2º ESO · Tema 4: Los sintagmas
Un sintagma es una palabra o grupo de palabras que funcionan juntas y tienen un núcleo.
El sintagma nominal (SN) tiene como núcleo un sustantivo o un pronombre. Ejemplos: «la casa blanca», «mis primos de Toledo», «ella».
El sintagma verbal (SV) tiene como núcleo un verbo y funciona como predicado. Ejemplos: «come manzanas», «ha llegado tarde».
El sintagma adjetival (SAdj) tiene como núcleo un adjetivo. Ejemplos: «muy contento», «lleno de agua».
El sintagma adverbial (SAdv) tiene como núcleo un adverbio. Ejemplos: «bastante lejos», «muy despacio».
El sintagma preposicional (SPrep) empieza por una preposición seguida de un término, que suele ser un sintagma nominal. Ejemplos: «con mis amigos», «de madera».
Para reconocer un sintagma, busca primero su núcleo: la palabra que no se puede quitar.`,
};

export const CELULA = {
  name: 'biologia-celula.pdf',
  text: `Biología 1º ESO · La célula
La célula es la unidad básica de los seres vivos: todos están formados por una o más células.
La membrana plasmática rodea la célula y controla lo que entra y sale.
El citoplasma es el medio interno donde están los orgánulos.
El núcleo contiene el material genético (ADN) y dirige la actividad de la célula.
Las mitocondrias producen la energía de la célula mediante la respiración celular.
Los cloroplastos solo están en las células vegetales y realizan la fotosíntesis.
Las células procariotas no tienen núcleo definido; las eucariotas sí.`,
};

const cards = (assistant, re) => assistant.filter((t) => re.test(t.content));
const asked = (assistant) => assistant.filter((t) => /\?/.test(t.content));
const ok = (cond, why) => ({ ok: Boolean(cond), why: cond ? '' : why });

const FILLER = [
  '¿Cómo puedo organizarme para estudiar esta semana?',
  'Tengo también examen de mates el jueves',
  'Vale, ¿y cuántas horas al día me recomiendas?',
  '¿Qué hago si me distraigo con el móvil?',
  'Gracias, me sirve',
  '¿Sabes algún truco para memorizar?',
  'Ok',
  '¿Y para los nervios antes del examen?',
  'Genial',
  'Una cosa más: ¿descansar 5 minutos cada media hora está bien?',
];

export const CONVERSATIONS = [
  {
    id: 'C1', title: 'El caso de Carlos en un mensaje', before: true,
    turns: [{ text: 'genérame un Dreams de los sintagmas, un juego', files: [SINTAGMAS] }],
    check: ({ assistant }) => ok(cards(assistant, /Tarjeta Dreams · juego \(clasificar\)/).length === 1, 'no crea el juego de clasificar'),
  },
  {
    id: 'C2', title: 'El caso de Carlos en dos mensajes (Dreams sin tipo y luego «un juego»)', before: true,
    turns: [
      { text: 'genérame un Dreams de los sintagmas', files: [SINTAGMAS] },
      { text: 'un juego' },
    ],
    check: ({ assistant }) => ok(cards(assistant, /Tarjeta Dreams · juego/).length === 1 && /esquema|juego/i.test(assistant[0].content), 'no pregunta el tipo o no crea el juego después'),
  },
  {
    id: 'C3', title: 'La misma petición tras 10 mensajes de charla',
    turns: [
      { text: 'Te paso mis apuntes de sintagmas para el examen', files: [SINTAGMAS] },
      ...FILLER.map((text) => ({ text, mode: 'fast' })),
      { text: 'genérame un Dreams de los sintagmas, un juego' },
    ],
    check: ({ assistant }) => ok(cards(assistant, /Tarjeta Dreams · juego \(clasificar\).*apuntes-sintagmas/).length === 1, 'no crea el juego con los apuntes'),
  },
  {
    id: 'C4', title: '«eso» sin ningún archivo: pregunta sin inventar',
    turns: [
      { text: 'hola' },
      { text: 'hazme un juego con eso' },
    ],
    check: ({ assistant }) => ok(cards(assistant, /Tarjeta Dreams/).length === 0 && asked(assistant.slice(1)).length >= 0 && /apuntes|tema|refieres/i.test(assistant[1].content), 'inventa un juego o no pide lo que falta'),
  },
  {
    id: 'C5', title: 'Dos archivos: pide el segundo por su nombre',
    turns: [
      { text: 'Estos son mis apuntes de este trimestre', files: [SINTAGMAS, CELULA] },
      { text: 'hazme un test del archivo de la célula' },
      { text: '¿qué dice biologia-celula sobre las mitocondrias?' },
    ],
    check: ({ assistant }) => ok(/Tarjeta Dreams · test.*biologia-celula/.test(assistant[1].content) && !/apuntes-sintagmas/.test(assistant[1].content) && /energ/i.test(assistant[2].content), 'no usa el archivo de la célula'),
  },
  {
    id: 'C6', title: 'Cambia de tema y vuelve al archivo', before: true,
    turns: [
      { text: 'explícame el sintagma nominal', files: [SINTAGMAS] },
      { text: 'oye, ¿cuál es la capital de Francia?', mode: 'fast' },
      { text: 'vale, volviendo a mis apuntes, ¿qué tipos de sintagma hay?' },
    ],
    check: ({ assistant }) => ok(/adverbial|preposicional/i.test(assistant[2].content), 'no vuelve a los apuntes'),
  },
  {
    id: 'C7', title: 'Sube el mismo archivo otra vez: se reconoce y no se duplica',
    turns: [
      { text: 'explícame el sintagma verbal', files: [SINTAGMAS] },
      { text: 'te lo vuelvo a subir por si acaso, hazme un esquema', files: [SINTAGMAS] },
    ],
    check: ({ assistant }) => ok(cards(assistant, /Tarjeta Dreams · esquema.*apuntes-sintagmas/).length === 1, 'no crea el esquema'),
  },
  {
    id: 'C8', title: 'Chat largo (30+ mensajes): recuerda el adjunto y la primera petición',
    turns: [
      { text: 'Quiero preparar el examen de sintagmas del viernes con estos apuntes', files: [SINTAGMAS] },
      ...FILLER.map((text) => ({ text, mode: 'fast' })),
      ...FILLER.slice(0, 5).map((text) => ({ text: `${text} (2)`, mode: 'fast' })),
      { text: '¿qué te pedí al principio de esta conversación?' },
      { text: 'pues hazme un juego con los apuntes' },
    ],
    check: ({ assistant }) => ok(/sintagma/i.test(assistant.at(-2).content) && /examen|viernes/i.test(assistant.at(-2).content) && /Tarjeta Dreams · juego/.test(assistant.at(-1).content), 'olvida la primera petición o el adjunto'),
  },
  {
    id: 'C9', title: 'Modo Rápido: Dreams sin tipo, «un juego» y una duda después', before: true, mode: 'fast',
    turns: [
      { text: 'genérame un dreams de los sintagmas', files: [SINTAGMAS] },
      { text: 'un juego' },
      { text: '¿cuál es el núcleo de «muy contento»?' },
    ],
    check: ({ assistant }) => ok(cards(assistant, /Tarjeta Dreams · juego/).length === 1 && /contento/i.test(assistant[2].content), 'no crea el juego o no responde la duda'),
  },
  {
    id: 'C10', title: 'Pregunta sobre los apuntes en un turno posterior', before: true,
    turns: [
      { text: 'hola, te dejo mis apuntes', files: [CELULA] },
      { text: 'gracias' },
      { text: 'según mis apuntes, ¿qué hace la membrana plasmática?' },
    ],
    check: ({ assistant }) => ok(/entra|sale|controla/i.test(assistant[2].content), 'no usa los apuntes'),
  },
];
