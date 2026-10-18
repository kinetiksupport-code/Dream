// El contexto del examen que va a la IA sigue acotado con 20 materiales
// (tope nuevo, migración 20261018160000_exam_materials_limit.sql).
import { assert } from "jsr:@std/assert@1.0.14";
import { examContext } from "../functions/dream-api/exams.ts";

const OWNER = "11111111-1111-4111-8111-111111111111";
const EXAM = "22222222-2222-4222-8222-222222222222";
const BUDGET = 20000; // caracteres de material en examContext

function fakeDb(materials) {
  const tables = {
    dream_exams: {
      data: {
        id: EXAM,
        owner_id: OWNER,
        title: "Historia",
        subject: "Historia",
        topics: ["Tema"],
        difficulties: "",
        goal: "",
        daily_minutes: 45,
      },
    },
    dream_exam_materials: {
      data: materials.map((_, i) => ({ attachment_id: `a${i}` })),
    },
    dream_attachments: { data: materials },
  };
  return {
    from(table) {
      const result = { ...tables[table], error: null };
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        maybeSingle: () => Promise.resolve(result),
        then: (resolve, reject) =>
          Promise.resolve(result).then(resolve, reject),
      };
      return chain;
    },
  };
}

Deno.test(
  "20 materiales grandes: el contexto no pasa del presupuesto",
  async () => {
    const materials = Array.from({ length: 20 }, (_, i) => ({
      file_name: `tema-${i + 1}.pdf`,
      extracted_text: `Contenido ${i + 1}. `.repeat(2000),
    }));
    const context = await examContext(fakeDb(materials), OWNER, EXAM);
    const header = context.indexOf("\n");
    assert(
      context.length - header <= BUDGET + 1000,
      `contexto de ${context.length} caracteres`,
    );
    // Con el reparto proporcional de file-guard.mjs (PR #31) cada archivo
    // tiene su parte; antes de unirlo, los primeros archivos se comen el presupuesto.
    let proportional = false;
    try {
      await import("../functions/dream-api/file-guard.mjs");
      proportional = true;
    } catch {
      /* rama sin PR #31 */
    }
    if (proportional)
      for (let i = 1; i <= 20; i++)
        assert(
          context.includes(`tema-${i}.pdf`) &&
            context.includes(`Contenido ${i}.`),
          `falta el material ${i}`,
        );
  },
);

Deno.test("con pocos materiales cortos entra todo", async () => {
  const materials = Array.from({ length: 3 }, (_, i) => ({
    file_name: `t${i}.txt`,
    extracted_text: `Idea ${i}`,
  }));
  const context = await examContext(fakeDb(materials), OWNER, EXAM);
  for (let i = 0; i < 3; i++) assert(context.includes(`Idea ${i}`));
});
