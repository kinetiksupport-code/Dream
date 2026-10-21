import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SEC-03 (auditoría del 21/10/2026): un `revoke select (prompt)` no sirve si
// authenticated conserva SELECT sobre toda la tabla. El arreglo quita la tabla
// entera y vuelve a dar solo columnas sin el prompt.
const fix = readFileSync("supabase/migrations/20261021090000_skills_prompt_private.sql", "utf8");

test("dream_skills: table-level access is revoked before column grants", () => {
  assert.match(fix, /revoke all on table public\.dream_skills from public, anon, authenticated/);
  const grant = fix.match(/grant select \(([^)]*)\) on public\.dream_skills to authenticated/);
  assert.ok(grant, "da lectura por columnas");
  const cols = grant[1].split(",").map((c) => c.trim());
  assert.ok(!cols.includes("prompt"), "el prompt no se puede leer con la sesión del alumno");
  assert.ok(fix.indexOf("revoke all") < fix.indexOf("grant select"));
});
