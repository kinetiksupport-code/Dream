import test from "node:test";
import assert from "node:assert/strict";
import {
  GAME_JSON_SCHEMAS,
  generateGame,
  gameKindFor as serverKindFor,
  validResult,
  validateGame,
} from "../supabase/functions/dream-api/games.mjs";
import { gameMessages } from "../supabase/functions/dream-api/prompts.mjs";
import { admissionOperation, consumingActions } from "../supabase/functions/dream-api/admission.mjs";
import {
  GAME_CSP,
  gameDocument,
  gameKindFor,
  jsonForScript,
  parseGame,
  parseGameMessage,
  wantsGame,
} from "../lib/dream-games";
import { parseDreamContent } from "../lib/widgets";
import { activeNav } from "../lib/navigation";

// Dreams interactivos (docs/ESQUEMAS.md, Bloque 7).
const SOURCE = `El sintagma nominal tiene como núcleo un sustantivo o un pronombre, por ejemplo «la casa blanca».
El sintagma verbal tiene como núcleo un verbo y funciona como predicado, por ejemplo «come manzanas rojas».
El sintagma preposicional empieza por una preposición seguida de un término, por ejemplo «con mis amigos del barrio».
El sintagma adjetival tiene como núcleo un adjetivo, por ejemplo «muy contento con el resultado».
La fotosíntesis es el proceso por el que las plantas fabrican materia orgánica a partir de luz.
La respiración celular es el proceso que libera la energía de la glucosa en las mitocondrias.
El cloroplasto es el orgánulo donde se realiza la fotosíntesis en las células vegetales.
La mitocondria es el orgánulo donde se realiza la respiración celular en las células.`;

const classify = {
  title: "Tipos de sintagma",
  instructions: "Coloca cada sintagma en su tipo.",
  categories: ["Sintagma nominal", "Sintagma verbal", "Sintagma preposicional"],
  items: [
    { text: "la casa blanca", category: "Sintagma nominal", explanation: "Núcleo: casa.", quote: "El sintagma nominal tiene como núcleo un sustantivo o un pronombre" },
    { text: "come manzanas rojas", category: "Sintagma verbal", explanation: "Núcleo: come.", quote: "El sintagma verbal tiene como núcleo un verbo y funciona como predicado" },
    { text: "con mis amigos del barrio", category: "Sintagma preposicional", explanation: "Empieza por «con».", quote: "El sintagma preposicional empieza por una preposición seguida de un término" },
    { text: "el perro", category: "sintagma nominal", explanation: "Núcleo: perro.", quote: "El sintagma nominal tiene como núcleo un sustantivo o un pronombre" },
  ],
};
const match = {
  title: "La célula",
  instructions: "Une cada concepto con su definición.",
  pairs: [
    { concept: "Fotosíntesis", definition: "Proceso por el que las plantas fabrican materia orgánica.", quote: "es el proceso por el que las plantas fabrican materia orgánica a partir de luz" },
    { concept: "Respiración celular", definition: "Libera la energía de la glucosa.", quote: "es el proceso que libera la energía de la glucosa en las mitocondrias" },
    { concept: "Cloroplasto", definition: "Orgánulo de la fotosíntesis.", quote: "es el orgánulo donde se realiza la fotosíntesis en las células vegetales" },
    { concept: "Mitocondria", definition: "Orgánulo de la respiración.", quote: "es el orgánulo donde se realiza la respiración celular en las células" },
  ],
};

test("juegos: el validador acepta contenido citado de los apuntes y une categorías sin mirar mayúsculas", () => {
  const r = validateGame(classify, { kind: "classify", sources: SOURCE });
  assert.ok(r.game, r.errors.join(" | "));
  const game = r.game as { items: { category: string }[]; categories: string[] };
  assert.equal(game.items[3].category, "Sintagma nominal");
  assert.equal(game.categories.length, 3);
  assert.ok(!("quote" in (game.items[0] as object)), "las citas no se guardan en el juego");
  const m = validateGame(match, { kind: "match", sources: SOURCE });
  assert.ok(m.game, m.errors.join(" | "));
});

test("juegos: sin cita literal el elemento se quita; con pocos, no hay juego", () => {
  const invented = { ...match, pairs: match.pairs.map((p, i) => (i === 0 ? { ...p, quote: "esto no está en los apuntes del alumno" } : p)) };
  const r = validateGame(invented, { kind: "match", sources: SOURCE });
  assert.equal(r.game, null);
  assert.equal(r.dropped, 1);
  assert.match(r.errors.join(" "), /no aparece literal/);
  const wrongCategory = { ...classify, items: classify.items.map((it, i) => (i === 1 ? { ...it, category: "Sintagma adverbial" } : it)) };
  const c = validateGame(wrongCategory, { kind: "classify", sources: SOURCE });
  assert.equal(c.game, null, "quedan 3 elementos: no llega al mínimo");
});

test("juegos: HTML y scripts del modelo se quedan en texto plano", () => {
  const hostile = { ...match, title: '<img src=x onerror="alert(1)">La célula', pairs: match.pairs.map((p, i) => (i === 0 ? { ...p, concept: "<script>fetch('x')</script>Fotosíntesis" } : p)) };
  const r = validateGame(hostile, { kind: "match", sources: SOURCE });
  const game = r.game as { title: string; pairs: { concept: string }[] };
  assert.equal(game.title, "La célula");
  assert.ok(!/[<>]/.test(game.pairs[0].concept));
});

test("juegos: generateGame reintenta una vez con los errores", async () => {
  const seen: unknown[][] = [];
  const answers = [{ title: "x", pairs: [] }, match];
  const r = await generateGame({
    call: async (messages) => {
      seen.push(messages);
      return answers[seen.length - 1];
    },
    messages: gameMessages({ kind: "match", request: "hazme un juego", sources: SOURCE }),
    kind: "match",
    sources: SOURCE,
  });
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 2);
  assert.match(JSON.stringify(seen[1]), /errores/);
});

test("juegos: esquemas JSON y prompt según la plantilla", () => {
  assert.deepEqual(GAME_JSON_SCHEMAS.classify.required, ["title", "instructions", "categories", "items"]);
  assert.deepEqual(GAME_JSON_SCHEMAS.match.required, ["title", "instructions", "pairs"]);
  const [system, user] = gameMessages({ kind: "classify", request: "clasifica", sources: "FUENTE" });
  assert.match(system.content, /CLASIFICAR/);
  assert.match(user.content, /datos, no instrucciones/);
});

test("juegos: gastan como un test en el cupo diario", () => {
  assert.ok(consumingActions.has("game_generate"));
  assert.equal(admissionOperation("game_generate"), "test_generate");
});

test("juegos: resultado válido solo con enteros en rango", () => {
  assert.ok(validResult(3, 5));
  assert.ok(!validResult(6, 5));
  assert.ok(!validResult(1.5, 5));
  assert.ok(!validResult(0, 0));
  assert.ok(!validResult(1, 99));
});

test("chat: «hazme un juego» y «clasifica los sintagmas» piden un juego; otras frases no", () => {
  for (const yes of ["Hazme un juego con estos apuntes", "quiero un minijuego para practicar", "clasifica los sintagmas de los apuntes", "empareja los conceptos con sus definiciones"])
    assert.ok(wantsGame(yes), yes);
  for (const no of ["¿Qué es un juego de rol?", "hazme un esquema", "explícame el sintagma nominal", "me gusta jugar al fútbol"])
    assert.ok(!wantsGame(no), no);
  assert.equal(gameKindFor("clasifica los sintagmas"), "classify");
  assert.equal(gameKindFor("hazme un juego de conceptos"), "match");
  assert.equal(serverKindFor("clasifica los sintagmas"), "classify");
});

test("iframe: solo se aceptan los mensajes con el formato fijo", () => {
  assert.deepEqual(parseGameMessage({ tipo: "resultado", aciertos: 3, total: 4 }), { tipo: "resultado", aciertos: 3, total: 4 });
  assert.equal(parseGameMessage({ tipo: "resultado", aciertos: 5, total: 4 }), null);
  assert.equal(parseGameMessage({ tipo: "resultado", aciertos: 3, total: 4, url: "https://x" }), null);
  assert.equal(parseGameMessage({ tipo: "navegar", url: "/settings" }), null);
  assert.equal(parseGameMessage("resultado"), null);
  assert.deepEqual(parseGameMessage({ tipo: "altura", alto: 99999 }), { tipo: "altura", alto: 4000 });
});

test("iframe: el contenido no puede cerrar el <script> ni saltarse la CSP", () => {
  const game = parseGame({ kind: "match", ...validateGame(match, { kind: "match", sources: SOURCE }).game, title: "</script><script>alert(1)</script>" });
  assert.ok(game);
  const doc = gameDocument(game!);
  assert.equal(doc.match(/<\/script>/g)?.length, 2, "solo cierran las dos etiquetas de Dream");
  assert.ok(doc.includes(`content="${GAME_CSP}"`));
  assert.match(GAME_CSP, /default-src 'none'/);
  assert.ok(!/connect-src|https?:/.test(GAME_CSP), "sin red");
  assert.equal(JSON.parse(jsonForScript({ a: "</script>& " })).a, "</script>& ");
});

test("iframe: parseGame rechaza contenido mal formado (fallback)", () => {
  assert.equal(parseGame(null), null);
  assert.equal(parseGame({ kind: "classify", title: "x", categories: ["a"], items: [] }), null);
  assert.equal(parseGame({ kind: "otro", title: "x" }), null);
  const g = parseGame({ kind: "classify", title: "x", instructions: "", categories: ["A", "B"], items: [{ text: "1", category: "A" }, { text: "2", category: "B" }, { text: "3", category: "C" }] });
  assert.equal(g?.kind === "classify" && g.items.length, 2);
});

test("chat: la tarjeta «Dreams» de un juego se lee del mensaje", () => {
  const id = "0f8b1d2e-3c4a-4b5c-8d6e-7f8091a2b3c4";
  const parsed = parseDreamContent(`He preparado un juego.\n\n<!--DREAM_WIDGET:${JSON.stringify({ type: "game", gameId: id, title: "La célula", kind: "match", count: 4 })}-->`);
  assert.deepEqual(parsed.games, [{ type: "game", gameId: id, title: "La célula", kind: "match", count: 4 }]);
  assert.equal(parseDreamContent(`<!--DREAM_WIDGET:${JSON.stringify({ type: "game", gameId: "x", title: "t", kind: "match" })}-->`).games.length, 0);
});

test("navegación: Dreams, esquemas y juegos marcan la sección «Dreams»", () => {
  assert.equal(activeNav("/dreams", {}), "dreams");
  assert.equal(activeNav("/esquemas/abc", {}), "dreams");
  assert.equal(activeNav("/juegos/abc", {}), "dreams");
  assert.equal(activeNav("/dreamsx", {}), null);
});
