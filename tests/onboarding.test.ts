import test from "node:test";
import assert from "node:assert/strict";
import {
  LIMITS,
  WELCOME_ERRORS,
  addInterest,
  birthCheck,
  birthIso,
  birthLabel,
  birthYears,
  clean,
  nameError,
  nicknameFor,
  nicknameSuggestions,
  resumeStep,
  setBirthPart,
  toggleInterest,
  wheelIndexForKey,
} from "../lib/onboarding";

const today = new Date(2026, 9, 20);

test("the name is required and has 40 characters at most", () => {
  assert.equal(nameError("   "), WELCOME_ERRORS.name);
  assert.equal(nameError("x".repeat(41)), WELCOME_ERRORS.nameLong);
  assert.equal(nameError("  Lucía  "), null);
  assert.equal(clean("  Ana   María ", LIMITS.name), "Ana María");
});

test("hobbies: up to 8, no duplicates, custom ones cut to 30 characters", () => {
  let list: string[] = [];
  for (const x of ["Fútbol", "Música", "Leer", "Baile", "Cocina", "Moda", "Viajar", "Dibujo"])
    list = toggleInterest(list, x);
  assert.equal(list.length, 8);
  assert.deepEqual(addInterest(list, "Ajedrez"), list, "never a ninth");
  list = toggleInterest(list, "Moda");
  assert.equal(list.length, 7);
  assert.deepEqual(addInterest(list, "fútbol"), list, "same hobby, other case");
  assert.deepEqual(addInterest(list, "futbol"), list, "same hobby, no accent");
  const long = addInterest([], "a".repeat(40));
  assert.equal(long[0].length, LIMITS.interest);
  assert.deepEqual(addInterest([], "   "), []);
});

test("nickname: suggestions from the name; empty means the first name", () => {
  assert.deepEqual(nicknameSuggestions("Alejandro Pérez"), ["Alejandro", "Ale", "Alejandro Pérez"]);
  assert.deepEqual(nicknameSuggestions("Lucía"), ["Lucía"]);
  assert.deepEqual(nicknameSuggestions(""), []);
  assert.equal(nicknameFor("", "Javier Gómez"), "Javier");
  assert.equal(nicknameFor("  Javi ", "Javier"), "Javi");
  assert.equal(nicknameFor("x".repeat(30), "Javier").length, LIMITS.nickname);
});

test("resume where the student was; the age is asked again", () => {
  assert.equal(resumeStep({ onboarding_step: 0 }, "welcome"), "hola");
  assert.equal(resumeStep({ onboarding_step: 3 }, "welcome"), "apodo");
  assert.equal(resumeStep({ onboarding_step: 9 }, "welcome"), "edad");
  assert.equal(resumeStep({}, "welcome"), "hola");
  assert.equal(resumeStep({ age_band: "18_plus" }, "consent"), "ia");
  assert.equal(resumeStep({ age_band: null }, "consent"), "edad");
});

test("birth wheel: real days only, 100 years back", () => {
  const feb = setBirthPart({ day: 31, month: 1, year: 2011 }, "month", 2);
  assert.deepEqual(feb, { day: 28, month: 2, year: 2011 });
  assert.equal(setBirthPart({ day: 29, month: 2, year: 2012 }, "year", 2011).day, 28);
  assert.equal(birthIso({ day: 3, month: 5, year: 2010 }), "2010-05-03");
  assert.equal(birthLabel({ day: 3, month: 5, year: 2010 }), "3 de mayo de 2010");
  const years = birthYears(today);
  assert.equal(years[0], 1926);
  assert.equal(years.at(-1), 2026);
});

test("the age step: untouched wheels, invalid dates and under 14", () => {
  assert.deepEqual(birthCheck("2010-01-01", false, today), { error: WELCOME_ERRORS.birth });
  assert.deepEqual(birthCheck("2027-01-01", true, today), { error: WELCOME_ERRORS.birthInvalid });
  assert.deepEqual(birthCheck("2012-10-21", true, today), { minor: true });
  assert.equal(birthCheck("2012-10-20", true, today), null);
});

test("wheel keyboard: arrows, pages, Home and End", () => {
  assert.equal(wheelIndexForKey(5, 12, "ArrowDown"), 6);
  assert.equal(wheelIndexForKey(0, 12, "ArrowUp"), 0);
  assert.equal(wheelIndexForKey(5, 100, "PageDown", 10), 15);
  assert.equal(wheelIndexForKey(5, 12, "Home"), 0);
  assert.equal(wheelIndexForKey(5, 12, "End"), 11);
  assert.equal(wheelIndexForKey(5, 12, "a"), null);
});
