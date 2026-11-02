import { test } from "node:test";
import assert from "node:assert/strict";
import { exportCards, parseCards } from "../lib/card-csv";

test("CSV de tarjetas: punto y coma, tabulador y coma; comillas; filas malas fuera", () => {
  assert.deepEqual(parseCards("¿Año?;1453\n¿Quién?;Mehmed II").rows, [
    { front: "¿Año?", back: "1453" },
    { front: "¿Quién?", back: "Mehmed II" },
  ]);
  assert.deepEqual(parseCards("a\tb\nc\td").rows.length, 2, "TSV de Anki y Quizlet");
  assert.deepEqual(parseCards('"Uno; dos";"Con ""comillas"""').rows, [{ front: "Uno; dos", back: 'Con "comillas"' }]);
  const bad = parseCards("solo pregunta\n;solo respuesta\nbien;sí\n" + "x".repeat(301) + ";y");
  assert.equal(bad.rows.length, 1);
  assert.equal(bad.skipped, 3);
});

test("CSV de tarjetas: tope de 500 filas y vuelta exacta al exportar", () => {
  const many = Array.from({ length: 520 }, (_, i) => `p${i};r${i}`).join("\n");
  const r = parseCards(many);
  assert.equal(r.rows.length, 500);
  assert.equal(r.truncated, true);
  const cards = [{ front: "¿A; B?", back: 'Dice "hola"' }, { front: "Línea", back: "Normal" }];
  assert.deepEqual(parseCards(exportCards(cards)).rows, cards);
});
