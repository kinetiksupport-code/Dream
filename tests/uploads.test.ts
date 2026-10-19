import test from "node:test";
import assert from "node:assert/strict";
import { DreamApiError, errorMessage } from "../lib/dream-api";
import {
  UPLOAD_MESSAGES,
  UploadError,
  sanitizeFileName,
  wrapStudentMaterial,
} from "../supabase/functions/dream-api/file-guard.mjs";

test("the student sees the server's upload message, never a code", () => {
  for (const [code, message] of Object.entries(UPLOAD_MESSAGES)) {
    const error = new UploadError(code);
    assert.equal(error.userMessage, message);
    assert.equal(
      errorMessage(new DreamApiError(message, error.status, 0, code)),
      message,
    );
    assert.doesNotMatch(message, /\b[a-z]+_[a-z_]+\b|undefined|Error/);
  }
  assert.equal(new UploadError("rate_limit").status, 429);
  assert.equal(new UploadError("nope").code, "unreadable");
});

test("file guard stays plain JS for Node and Deno", () => {
  assert.equal(sanitizeFileName("Tema 1.pdf"), "Tema 1.pdf");
  assert.throws(() => sanitizeFileName("../x.pdf"));
  assert.match(
    wrapStudentMaterial([{ file_name: "a.txt", extracted_text: "hola" }]),
    /^<material_del_alumno archivo="a.txt">\nhola\n<\/material_del_alumno>$/,
  );
});
