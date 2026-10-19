import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { wants3D, weakDevice, type Device3D } from "../lib/subject-3d";
import {
  DEFAULT_MODEL,
  MODEL_FOR_OBJECT,
  SUBJECT_MODELS,
  pointerTilt,
  subjectModel,
} from "../lib/subject-models";
import { KNOWN_SUBJECTS, SUBJECT_OBJECTS } from "../lib/subject-objects";

test("each subject gets its 3D model; Matemáticas is a calculator (§5.8)", () => {
  const expected: Record<string, string> = {
    Geografía: "globe",
    Matemáticas: "calculator",
    "Lengua y Literatura": "book",
    Plástica: "brush",
    Historia: "scroll",
    Física: "atom",
    Química: "flask",
    Biología: "microscope",
    Inglés: "speech",
    Filosofía: "bulb",
    Música: "note",
    Informática: "laptop",
    Economía: "coin",
    "Educación Física": "ball",
    Otra: "cap",
  };
  for (const [subject, model] of Object.entries(expected))
    assert.equal(subjectModel(subject), model, subject);
});

test("free-text and unknown subjects: keywords, then the mortarboard", () => {
  assert.equal(subjectModel("Mates 2º ESO"), "calculator");
  assert.equal(subjectModel("  química orgánica "), "flask");
  assert.equal(subjectModel("Educación física"), "ball");
  assert.equal(subjectModel("Derecho romano"), DEFAULT_MODEL);
  assert.equal(subjectModel(""), "cap");
  assert.equal(subjectModel(null), "cap");
  assert.equal(subjectModel(undefined), "cap");
  assert.equal(subjectModel("Historia", "coin"), "coin", "forced object wins");
});

test("every static object and known subject has a model", () => {
  for (const o of SUBJECT_OBJECTS)
    assert.ok(SUBJECT_MODELS.includes(MODEL_FOR_OBJECT[o]), o);
  for (const s of KNOWN_SUBJECTS) assert.ok(SUBJECT_MODELS.includes(subjectModel(s)), s);
});

test("every model has a builder in components/subject-3d/models.ts", () => {
  const src = readFileSync("components/subject-3d/models.ts", "utf8");
  for (const m of SUBJECT_MODELS)
    assert.match(src, new RegExp(`\\n  ${m}\\(`), `builder for ${m}`);
});

const desktop: Device3D = {
  desktop: true,
  reducedMotion: false,
  cores: 8,
  memoryGb: 8,
  saveData: false,
};

test("3D only on a capable desktop without reduced motion", () => {
  assert.equal(wants3D(desktop), true);
  assert.equal(wants3D({ ...desktop, desktop: false }), false, "mobile/touch");
  assert.equal(wants3D({ ...desktop, reducedMotion: true }), false, "reduced motion");
  assert.equal(wants3D({ ...desktop, saveData: true }), false, "save data");
  assert.equal(wants3D({ ...desktop, cores: 4 }), false, "4 cores is weak");
  assert.equal(wants3D({ ...desktop, memoryGb: 4 }), false, "4 GB is weak");
  assert.equal(wants3D({ ...desktop, memoryGb: 2 }), false);
  assert.equal(
    wants3D({ ...desktop, cores: undefined, memoryGb: undefined }),
    true,
    "unknown hardware (Safari/Firefox hide it) does not block",
  );
});

test("weak device thresholds", () => {
  assert.equal(weakDevice(2, 8), true);
  assert.equal(weakDevice(6, 8), false);
  assert.equal(weakDevice(16, 0.5), true);
  assert.equal(weakDevice(0, undefined), false, "0 means unknown");
});

test("pointer tilt is gentle, bounded and points at the pointer", () => {
  assert.deepEqual(pointerTilt(0, 0, 1280, 800), { x: 0, y: 0 });
  const right = pointerTilt(640, 0, 1280, 800);
  assert.ok(right.y > 0 && right.x === 0);
  const far = pointerTilt(99999, -99999, 1280, 800);
  assert.equal(far.y, 0.35);
  assert.equal(far.x, -0.35);
  assert.deepEqual(pointerTilt(10, 10, 0, 0), { x: 0, y: 0 });
});
