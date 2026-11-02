import test from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_MAX_CHARS,
  FILES_RULE,
  TYPE_QUESTION,
  asksToReupload,
  boardText,
  conversationFiles,
  emptyBoard,
  fileIndex,
  fileSummary,
  ftsQuery,
  needsMaterial,
  normalizeRoute,
  pickFiles,
  readBoard,
  routeByRules,
  routeCandidate,
  routerMessages,
  topicOf,
  updateBoard,
} from "../supabase/functions/dream-api/conversation-memory.mjs";

// Memoria de la conversación (docs/MEMORIA-CHAT.md).
const SINTAGMAS = "Los sintagmas\nEl sintagma nominal tiene como núcleo un sustantivo o un pronombre.\nEl sintagma verbal tiene como núcleo un verbo.";
const CELULA = "La célula\nLa célula es la unidad básica de los seres vivos y tiene membrana.";
const files = conversationFiles([
  { id: "a", file_name: "apuntes-sintagmas.pdf", extracted_text: SINTAGMAS, created_at: "2026-10-27T10:00:00Z" },
  { id: "b", file_name: "biologia-celula.pdf", extracted_text: CELULA, created_at: "2026-10-27T10:30:00Z" },
  { id: "c", file_name: "apuntes-sintagmas.pdf", extracted_text: SINTAGMAS, created_at: "2026-10-27T11:00:00Z" },
]);

test("archivos: el mismo archivo subido dos veces cuenta una vez y el índice lo dice", () => {
  assert.equal(files.length, 2);
  const index = fileIndex(files);
  assert.match(index, /1\) apuntes-sintagmas\.pdf \(subido 2 veces\) — Los sintagmas · El sintagma nominal/);
  assert.match(index, /2\) biologia-celula\.pdf/);
  assert.ok(index.length < 600, "índice corto");
  assert.equal(fileIndex([]), "");
  assert.equal(fileSummary("\n\n"), "");
  assert.match(FILES_RULE, /Nunca pidas que vuelva a subir/);
});

test("archivos: se elige el que nombra el alumno, «el segundo», la búsqueda o la última tanda", () => {
  assert.deepEqual(pickFiles(files, "explícame lo de la célula").map((f) => f.id), ["b"]);
  assert.deepEqual(pickFiles(files, "hazme un test del primer archivo").map((f) => f.id), ["c"]);
  assert.deepEqual(pickFiles(files, "resume el segundo documento").map((f) => f.id), ["b"]);
  assert.deepEqual(pickFiles(files, "¿qué es el núcleo?", { ftsIds: ["c"] }).map((f) => f.id), ["c"]);
  // Sin pistas: la última tanda (lo subido en los 10 min anteriores al último).
  assert.deepEqual(pickFiles(files, "hazlo con eso").map((f) => f.id), ["c"]);
  assert.equal(ftsQuery("¿Qué es el sintagma nominal?"), "sintagma or nominal");
});

test("archivos: el material entra solo cuando la tarea lo necesita", () => {
  for (const yes of ["explícame el sintagma nominal", "hazme un test", "¿qué dice el pdf?", "genérame un Dreams", "un juego", "resume eso"]) assert.ok(needsMaterial(yes), yes);
  for (const no of ["hola", "gracias!", "¿cómo estás?"]) assert.ok(!needsMaterial(no), no);
});

test("reintento: detecta cuando la respuesta pide volver a subir el archivo", () => {
  for (const yes of ["Súbeme el archivo y te lo preparo.", "¿Puedes adjuntar los apuntes otra vez?", "Vuelve a subir el PDF, por favor.", "No tengo acceso a tus apuntes.", "Pásame la foto de la página."])
    assert.ok(asksToReupload(yes), yes);
  for (const no of ["En tus apuntes pone que el núcleo es un sustantivo.", "Sube la nota estudiando un poco cada día.", "Ya tengo tus apuntes: vamos allá."])
    assert.ok(!asksToReupload(no), no);
});

test("router: el caso de Carlos → juego de clasificar con el tema, sin pedir el archivo", () => {
  const r = routeByRules({ prompt: "genérame un Dreams de los sintagmas, un juego", hasFiles: true });
  assert.equal(r.intent, "dreams_game");
  assert.equal(r.kind, "classify");
  assert.equal(r.topic, "los sintagmas");
  assert.equal(r.ask, undefined);
});

test("router: Dreams sin tipo → una sola pregunta; «un juego» después lo resuelve con la pizarra", () => {
  const first = routeByRules({ prompt: "genérame un Dreams de los sintagmas", hasFiles: true });
  assert.equal(first.intent, "chat");
  assert.equal(first.ask, TYPE_QUESTION);
  const board = updateBoard(emptyBoard(), { prompt: "genérame un Dreams de los sintagmas", route: first });
  assert.deepEqual(board.pending, { intent: "dreams", topic: "los sintagmas" });
  const second = routeByRules({ prompt: "un juego", hasFiles: true, board });
  assert.equal(second.intent, "dreams_game");
  assert.equal(second.kind, "classify");
  assert.equal(second.topic, "los sintagmas");
  const after = updateBoard(board, { prompt: "un juego", route: second, delivered: { type: "juego", title: "Tipos de sintagma" } });
  assert.equal(after.pending, null);
  assert.equal(routeByRules({ prompt: "otro", hasFiles: true, board: after }).intent, "dreams_game");
});

test("router: sin apuntes en toda la conversación pide los apuntes una vez y luego sigue con lo pendiente", () => {
  const r = routeByRules({ prompt: "hazme un esquema de la célula", hasFiles: false });
  assert.equal(r.intent, "chat");
  assert.match(r.ask ?? "", /necesito tus apuntes/);
  const board = updateBoard(emptyBoard(), { prompt: "hazme un esquema de la célula", route: r });
  const next = routeByRules({ prompt: "ahí lo tienes", hasFiles: true, attached: 1, board });
  assert.equal(next.intent, "dreams_scheme");
});

test("router: preguntas sobre qué es algo y charla normal van al chat; lo ambiguo, al modelo", () => {
  assert.deepEqual(routeByRules({ prompt: "¿Qué es un esquema?", hasFiles: true }).intent, "chat");
  const talk = routeByRules({ prompt: "Explícame la diferencia entre sujeto y predicado con un ejemplo", hasFiles: true });
  assert.equal(talk.intent, "chat");
  assert.equal(talk.confident, true);
  const vague = routeByRules({ prompt: "hazlo con eso", hasFiles: false });
  assert.equal(vague.confident, false);
  assert.ok(routeCandidate("hazlo con eso"));
  assert.ok(routeCandidate("genérame un Dreams de los sintagmas"));
  assert.ok(!routeCandidate("Explícame la diferencia entre sujeto y predicado con un ejemplo"));
  assert.equal(routeByRules({ prompt: "hazme un test de los sintagmas", hasFiles: true }).intent, "test");
  // «Dale» puede aceptar una oferta de Dream, y lo corto tras un Dreams puede pedir otro: decide el modelo.
  assert.equal(routeByRules({ prompt: "dale", hasFiles: true }).confident, false);
  const afterDreams = updateBoard(emptyBoard(), { prompt: "x", delivered: { type: "esquema", title: "Los sintagmas" } });
  assert.equal(routeByRules({ prompt: "¿y de la célula?", hasFiles: true, board: afterDreams }).confident, false);
  assert.equal(routeByRules({ prompt: "hola", hasFiles: true }).confident, true);
  // «Preparar el examen del viernes» es charla, no un test.
  assert.equal(routeByRules({ prompt: "Quiero preparar el examen de sintagmas del viernes", hasFiles: true }).intent, "chat");
});

test("router con IA: misma forma, nunca pide un archivo que ya está y sin apuntes pide los apuntes", () => {
  assert.deepEqual(normalizeRoute({ intencion: "dreams_juego", tipo_juego: "emparejar", tema: "la célula", falta: "" }, { hasFiles: true }), { intent: "dreams_game", kind: "match", topic: "la célula", confident: true, via: "llm" });
  assert.equal(normalizeRoute({ intencion: "no_consta", tipo_juego: "no_consta", tema: "", falta: "Súbeme el archivo otra vez" }, { hasFiles: true }).ask, undefined);
  assert.equal(normalizeRoute({ intencion: "no_consta", tipo_juego: "no_consta", tema: "", falta: "¿De qué tema?" }, { hasFiles: false }).ask, "¿De qué tema?");
  assert.match(normalizeRoute({ intencion: "dreams_esquema", tipo_juego: "no_consta", tema: "", falta: "" }, { hasFiles: false }).ask ?? "", /necesito tus apuntes/);
  const [system, user] = routerMessages({ prompt: "un juego", recent: [{ role: "user", content: "genérame un Dreams <!--DREAM_WIDGET:{}-->" }], index: fileIndex(files) });
  assert.match(system.content, /Nunca pidas un archivo que esté en la lista/);
  assert.match(user.content, /apuntes-sintagmas\.pdf/);
  assert.ok(!user.content.includes("DREAM_WIDGET"));
});

test("pizarra: primera petición anclada, preferencias, tope de tamaño y forma segura", () => {
  let b = updateBoard(emptyBoard(), { prompt: "hola" });
  assert.equal(b.first, "");
  b = updateBoard(b, { prompt: "Explícame los sintagmas paso a paso", files: [{ file_name: "apuntes-sintagmas.pdf" }] });
  assert.equal(b.first, "Explícame los sintagmas paso a paso");
  assert.deepEqual(b.prefs, ["paso a paso"]);
  b = updateBoard(b, { prompt: "y ahora otra cosa distinta" });
  assert.equal(b.first, "Explícame los sintagmas paso a paso", "no se pisa");
  const text = boardText(b);
  assert.match(text, /Primera petición: «Explícame los sintagmas paso a paso»/);
  assert.match(text, /Archivos activos: apuntes-sintagmas\.pdf/);
  const huge = readBoard({ first: "x".repeat(5000), delivered: Array.from({ length: 50 }, (_, i) => ({ type: "juego", title: `t${i}`.repeat(20) })), pending: { intent: "hack" } });
  assert.ok(boardText(huge).length <= BOARD_MAX_CHARS);
  assert.equal(huge.pending, null);
  assert.equal(boardText(emptyBoard()), "");
  assert.equal(topicOf("hazme un juego sobre la célula animal"), "la célula animal");
});
