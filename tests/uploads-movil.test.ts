import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CHAT_FILES,
  MAX_RAW_IMAGE_BYTES,
  PHOTO_MAX_SIDE,
  fitWithin,
  prepareFile,
  validateFile,
  withUploadRetry,
} from "../lib/attachments";
import {
  MAX_MESSAGE_ATTACHMENTS,
  MAX_VISION_BYTES,
  UPLOAD_MESSAGES,
} from "../supabase/functions/dream-api/file-guard.mjs";

const file = (name: string, size: number, type = "") => new File([new Uint8Array(size)], name, { type });

test("las fotos del móvil (12–48 MP, 8–20 MB) ya no se rechazan antes de reducirlas", () => {
  assert.doesNotThrow(() => validateFile(file("IMG_0001.jpg", 14 * 1024 * 1024, "image/jpeg")));
  assert.throws(() => validateFile(file("IMG.jpg", MAX_RAW_IMAGE_BYTES + 1)), /40 MB/);
  // Los PDF, Office y GIF siguen con el límite del servidor.
  assert.throws(() => validateFile(file("apuntes.pdf", 9 * 1024 * 1024)), /8 MB/);
  assert.throws(() => validateFile(file("a.gif", 9 * 1024 * 1024)), /8 MB/);
  assert.throws(() => validateFile(file("notas.txt", 600 * 1024)), /500 KB/);
});

test("reducción: lado mayor de 1.600 px manteniendo la proporción", () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(3024, 4032), { width: 1200, height: 1600 });
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
  assert.equal(PHOTO_MAX_SIDE, 1600);
});

test("prepareFile no toca PDF ni texto (y fuera del navegador devuelve el original)", async () => {
  const pdf = file("a.pdf", 1000, "application/pdf");
  assert.equal(await prepareFile(pdf), pdf);
  const photo = file("a.jpg", 1000, "image/jpeg");
  assert.equal(await prepareFile(photo), photo);
});

test("reintento: espera y repite en 429/503/fallo de red; no en errores del alumno", async () => {
  const waits: number[] = [];
  let calls = 0;
  const ok = await withUploadRetry(
    async () => {
      calls++;
      if (calls === 1) throw Object.assign(new Error("ocupado"), { status: 429, retryAfter: 7 });
      if (calls === 2) throw new TypeError("Failed to fetch");
      return "listo";
    },
    { onWait: (s) => waits.push(s), sleep: async () => {} },
  );
  assert.equal(ok, "listo");
  assert.deepEqual(waits, [7, 8]);
  let bad = 0;
  await assert.rejects(
    withUploadRetry(async () => { bad++; throw Object.assign(new Error("formato"), { status: 400 }); }, { sleep: async () => {} }),
    /formato/,
  );
  assert.equal(bad, 1);
  let always = 0;
  await assert.rejects(
    withUploadRetry(async () => { always++; throw Object.assign(new Error("caído"), { status: 503, retryAfter: 999 }); }, {
      onWait: (s) => assert.ok(s <= 30),
      sleep: async () => {},
    }),
    /caído/,
  );
  assert.equal(always, 4);
});

test("8 archivos por mensaje en la web y en el servidor; la IA de imágenes, ≤ 4 MB en base64", () => {
  assert.equal(MAX_CHAT_FILES, 8);
  assert.equal(MAX_MESSAGE_ATTACHMENTS, MAX_CHAT_FILES);
  assert.ok(Math.ceil(MAX_VISION_BYTES / 3) * 4 <= 4 * 1024 * 1024);
  assert.match(UPLOAD_MESSAGES.image_too_heavy, /foto/);
});
