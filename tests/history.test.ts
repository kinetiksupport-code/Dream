// Historial: automatic titles without AI, list labels and groups.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TITLE,
  TITLE_MAX,
  dateTitle,
  displayTitle,
  isDefaultTitle,
  isGibberish,
  titleFromPrompt,
} from "../lib/conversation-title";
import { groupLabel, rowMeta } from "../lib/history";

const now = new Date(2026, 9, 15, 12);

test("the title comes from the first question, tidied and capitalised", () => {
  assert.equal(
    titleFromPrompt("  no entiendo   las derivadas\n de funciones  ", now),
    "No entiendo las derivadas de funciones",
  );
  assert.equal(
    titleFromPrompt("¿qué es una derivada?", now),
    "¿Qué es una derivada?",
  );
  assert.equal(
    titleFromPrompt("explícame la fotosíntesis.", now),
    "Explícame la fotosíntesis",
  );
});

test("greetings are dropped, also chained ones", () => {
  assert.equal(
    titleFromPrompt("hola, ¿me explicas las leyes de Newton?", now),
    "¿Me explicas las leyes de Newton?",
  );
  assert.equal(
    titleFromPrompt(
      "Buenas tardes Dream! necesito ayuda con el subjuntivo",
      now,
    ),
    "Necesito ayuda con el subjuntivo",
  );
  assert.equal(
    titleFromPrompt("Hola, buenas, oye: resume el tema 4", now),
    "Resume el tema 4",
  );
  // «Holanda» is not a greeting.
  assert.equal(
    titleFromPrompt("Holanda y sus canales", now),
    "Holanda y sus canales",
  );
});

test("long questions are cut at a whole word near 48 characters", () => {
  const title = titleFromPrompt(
    "Necesito entender cómo se resuelven las ecuaciones de segundo grado con discriminante negativo",
    now,
  );
  assert.equal(title, "Necesito entender cómo se resuelven las…");
  assert.ok(title.length <= TITLE_MAX + 1);
  assert.ok(!/\s…$/.test(title));
  // One very long word is cut hard rather than left whole.
  const word = titleFromPrompt("electroencefalografista".repeat(3), now);
  assert.equal(word.length, TITLE_MAX + 1);
});

test("junk or very short text falls back to the date", () => {
  for (const junk of [
    "ggfg",
    "x",
    "ok",
    "hola",
    "Buenas tardes",
    "aaaa",
    "jajaja",
    "sdfghk",
    "123",
    "?!",
    "   ",
  ])
    assert.equal(
      titleFromPrompt(junk, now),
      "Conversación del 15 de octubre",
      junk,
    );
  assert.equal(isGibberish("Newton"), false);
  assert.equal(isGibberish("pH"), true); // fewer than 3 letters
  assert.equal(isGibberish("sol"), false);
});

test("old «Nueva conversación» titles show the date in the list only", () => {
  assert.equal(isDefaultTitle(DEFAULT_TITLE), true);
  assert.equal(isDefaultTitle("  "), true);
  assert.equal(isDefaultTitle("Leyes de Newton"), false);
  const at = new Date(2026, 9, 3, 18).toISOString();
  assert.equal(
    displayTitle({ title: DEFAULT_TITLE, updated_at: at }, now),
    "Conversación del 3 de octubre",
  );
  assert.equal(
    displayTitle({ title: "Leyes de Newton", updated_at: at }, now),
    "Leyes de Newton",
  );
  assert.equal(
    dateTitle(new Date(2025, 2, 1), now),
    "Conversación del 1 de marzo de 2025",
  );
  assert.equal(
    displayTitle({ title: DEFAULT_TITLE, updated_at: "nope" }, now),
    "Conversación",
  );
});

test("groups follow the calendar week (Monday) and month", () => {
  const monday = new Date(2026, 9, 12, 9).toISOString();
  const sunday = new Date(2026, 9, 11, 9).toISOString();
  const lastMonth = new Date(2026, 8, 30, 9).toISOString();
  assert.equal(groupLabel(monday, now), "Esta semana");
  assert.equal(groupLabel(sunday, now), "Este mes");
  assert.equal(groupLabel(lastMonth, now), "Más antiguas");
  // On a Monday, Sunday is «Ayer».
  assert.equal(groupLabel(sunday, new Date(2026, 9, 12, 10)), "Ayer");
  assert.match(
    rowMeta(new Date(2026, 9, 15, 9, 5).toISOString(), now),
    /09:05/,
  );
  assert.equal(rowMeta(monday, now), "lunes");
  assert.equal(rowMeta(lastMonth, now), "30 de septiembre");
});
