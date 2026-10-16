import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanShareFragment,
  pathAnnouncement,
  shareProgress,
  shareText,
  studyPath,
  type PathUnit,
} from "../lib/study-path";

const titles = [
  "Límites",
  "Continuidad",
  "Derivadas",
  "Aplicaciones de la derivada",
  "Integrales",
  "Áreas",
  "Matrices",
  "Determinantes",
  "Sistemas",
  "Geometría",
];
function units(statuses: PathUnit["status"][]): PathUnit[] {
  return statuses.map((status, position) => ({
    id: `u${position}`,
    position,
    title: titles[position],
    status,
  }));
}
const states = (u: PathUnit[]) => studyPath(u).nodes.map((n) => n.state);

test("cada unidad recibe su estado: completada, a continuación, en curso y pendiente", () => {
  const path = studyPath(
    units(["completed", "completed", "in_progress", "pending", "pending"]),
  );
  assert.deepEqual(
    path.nodes.map((n) => [n.state, n.label]),
    [
      ["completed", "Completada"],
      ["completed", "Completada"],
      ["next", "A continuación"],
      ["pending", "Pendiente"],
      ["pending", "Pendiente"],
    ],
  );
  assert.equal(path.next?.unit.id, "u2");
  assert.deepEqual([path.completed, path.total, path.percentage], [2, 5, 40]);
  assert.equal(pathAnnouncement(path), "2 de 5 temas completados, 40 %.");
});

test("«A continuación» es siempre la primera sin completar; las empezadas después siguen «En curso»", () => {
  assert.deepEqual(states(units(["pending", "pending", "pending"])), [
    "next",
    "pending",
    "pending",
  ]);
  const shuffled = units([
    "completed",
    "pending",
    "in_progress",
    "completed",
  ]).reverse();
  assert.deepEqual(states(shuffled), [
    "completed",
    "next",
    "in_progress",
    "completed",
  ]);
});

test("ruta vacía o terminada", () => {
  const empty = studyPath([]);
  assert.deepEqual([empty.total, empty.percentage, empty.next], [0, 0, null]);
  const done = studyPath(units(["completed", "completed"]));
  assert.deepEqual([done.percentage, done.next], [100, null]);
});

test("texto compartido: porcentaje, temas y siguiente tema", () => {
  const u = units([
    ...Array<PathUnit["status"]>(4).fill("completed"),
    ...Array<PathUnit["status"]>(6).fill("pending"),
  ]);
  assert.equal(
    shareText("Matemáticas II", u),
    "Voy por el 40 % de mi ruta para Matemáticas II: 4 de 10 temas. Siguiente: Integrales. Con Dream — edudream.es",
  );
  assert.equal(
    shareText("Matemáticas II", units(["completed", "completed"])),
    "He completado mi ruta para Matemáticas II: 2 de 2 temas. Con Dream — edudream.es",
  );
  assert.equal(
    shareText("", units(["in_progress"])),
    "Voy por el 0 % de mi ruta para mi examen: 0 de 1 temas. Siguiente: Límites. Con Dream — edudream.es",
  );
});

test("texto compartido sin datos personales", () => {
  const u = units(["completed", "pending"]);
  u[1].title = "Integrales de lucia.perez@example.com +34 612 345 678";
  const text = shareText("Física de @lucia https://x.test/perfil", u);
  assert.doesNotMatch(text, /@|lucia\.perez|612|https?:|x\.test/);
  assert.equal(
    text,
    "Voy por el 50 % de mi ruta para Física de: 1 de 2 temas. Siguiente: Integrales de. Con Dream — edudream.es",
  );
  // Solo recibe asignatura y unidades: ni nombre, ni correo, ni conversaciones.
  assert.equal(shareText.length, 2);
  assert.equal(cleanShareFragment("a".repeat(80)).length, 60);
  assert.equal(cleanShareFragment("Tema‮ oculto\n"), "Tema oculto");
});

test("compartir usa la Web Share API y cae al portapapeles", async () => {
  const shared: string[] = [];
  const copied: string[] = [];
  const clipboard = {
    writeText: async (t: string) => {
      copied.push(t);
    },
  };
  assert.equal(
    await shareProgress("hola", {
      share: async ({ text }) => {
        shared.push(text);
      },
      clipboard,
    }),
    "shared",
  );
  assert.equal(await shareProgress("hola", { clipboard }), "copied");
  const abort = Object.assign(new Error("cancel"), { name: "AbortError" });
  assert.equal(
    await shareProgress("hola", {
      share: async () => {
        throw abort;
      },
      clipboard,
    }),
    "cancelled",
  );
  assert.equal(
    await shareProgress("hola", {
      share: async () => {
        throw new Error("NotAllowedError");
      },
      clipboard,
    }),
    "copied",
  );
  assert.equal(await shareProgress("hola", {}), "failed");
  assert.equal(
    await shareProgress("hola", {
      clipboard: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    }),
    "failed",
  );
  assert.deepEqual(shared, ["hola"]);
  assert.deepEqual(copied, ["hola", "hola"]);
});
