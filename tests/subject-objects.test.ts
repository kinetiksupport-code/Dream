import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import {
  DEFAULT_OBJECT,
  KNOWN_SUBJECTS,
  OBJECT_LABEL,
  OBJECT_SIZES,
  SUBJECT_OBJECTS,
  knownSubject,
  normalizeSubject,
  objectSrc,
  subjectObject,
} from "../lib/subject-objects";

test("the prompt's map: each subject gets its object (§5.8)", () => {
  const expected: Record<string, string> = {
    Geografía: "globe",
    Matemáticas: "abacus",
    "Lengua y Literatura": "book",
    Plástica: "brush",
    Historia: "scroll",
    Física: "atom",
    Química: "testtube",
    Biología: "microscope",
    Inglés: "speech",
    Filosofía: "bulb",
    Música: "note",
    Informática: "laptop",
    Economía: "coin",
    "Educación Física": "ball",
    Otra: "cap",
  };
  for (const [subject, object] of Object.entries(expected))
    assert.equal(subjectObject(subject), object, subject);
});

test("free names are recognised by keyword, the most specific first", () => {
  assert.equal(subjectObject("  mates 2º ESO "), "abacus");
  assert.equal(subjectObject("EDUCACIÓN FÍSICA"), "ball");
  assert.equal(subjectObject("Física y Química 3º"), "atom");
  assert.equal(subjectObject("Química orgánica"), "testtube");
  assert.equal(subjectObject("Historia de España"), "scroll");
  assert.equal(subjectObject("Geografía e Historia"), "globe");
  assert.equal(subjectObject("English B1"), "speech");
  assert.equal(subjectObject("Lengua castellana"), "book");
  assert.equal(subjectObject("Dibujo técnico"), "brush");
  assert.equal(subjectObject("Programación"), "laptop");
  assert.equal(subjectObject("Economía de la empresa"), "coin");
  // Word starts only: «aparte» is not «arte».
  assert.equal(subjectObject("Repaso aparte"), DEFAULT_OBJECT);
});

test("unknown, empty or missing subjects fall back to the cap", () => {
  for (const s of ["", "   ", "Astrología", null, undefined])
    assert.equal(subjectObject(s), DEFAULT_OBJECT);
  assert.equal(DEFAULT_OBJECT, "cap");
});

test("normalisation and the closed list", () => {
  assert.equal(normalizeSubject("  Física   y  QUÍMICA "), "fisica y quimica");
  assert.equal(knownSubject("matematicas"), "Matemáticas");
  assert.equal(knownSubject("Astrología"), null);
  assert.equal(KNOWN_SUBJECTS.at(-1), "Otra");
  assert.equal(new Set(KNOWN_SUBJECTS).size, KNOWN_SUBJECTS.length);
});

test("every object has a label and both WebP sizes on disk (fixed sizes, small files)", () => {
  for (const key of SUBJECT_OBJECTS) {
    assert.ok(OBJECT_LABEL[key], key);
    for (const px of OBJECT_SIZES) {
      const file = `public${objectSrc(key, px)}`;
      assert.ok(existsSync(file), file);
      assert.ok(statSync(file).size < 16_000, `${file} is too big`);
    }
  }
  // Every mapped subject resolves to an object that exists.
  for (const subject of KNOWN_SUBJECTS)
    assert.ok(SUBJECT_OBJECTS.includes(subjectObject(subject)), subject);
});
