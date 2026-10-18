import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1.0.14";
import JSZip from "npm:jszip@3.10.1";
import { extractAttachment } from "../functions/dream-api/attachments.mjs";
import { chatShortcut, CHAT_SHORTCUTS } from "../functions/dream-api/validation.ts";
import {
  CHAT_SHORTCUT_PROMPTS,
  dynamicContextFor,
} from "../functions/dream-api/prompts.mjs";
Deno.test(
  "real Office extractors accept synthetic DOCX/PPTX/XLSX and reject expansion bombs",
  async () => {
    for (const [fileName, path] of [
      ["notes.docx", "word/document.xml"],
      ["notes.pptx", "ppt/slides/slide1.xml"],
      ["notes.xlsx", "xl/worksheets/sheet1.xml"],
    ]) {
      const zip = new JSZip();
      zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
      zip.file(path, "<document><p>Concepto verificado</p></document>");
      const base64 = await zip.generateAsync({
        type: "base64",
        compression: "DEFLATE",
      });
      const text = await extractAttachment({
        fileName,
        mimeType: "",
        base64,
        signal: new AbortController().signal,
        admission: undefined,
      });
      assertEquals(text.includes("Concepto verificado"), true);
    }
    const bomb = new JSZip();
    bomb.file("[Content_Types].xml", "<Types/>");
    bomb.file("word/document.xml", "x".repeat(5 * 1024 * 1024));
    const bombBase64 = await bomb.generateAsync({
      type: "base64",
      compression: "DEFLATE",
    });
    await assertRejects(() =>
      extractAttachment({
        fileName: "bomb.docx",
        mimeType: "",
        base64: bombBase64,
        signal: new AbortController().signal,
        admission: undefined,
      }),
    );
  },
);
Deno.test(
  "Deno Sentry sends only scrubbed technical envelope to a local collector",
  async () => {
    let envelope = "";
    const server = Deno.serve(
      { hostname: "127.0.0.1", port: 0, onListen: () => {} },
      async (req) => {
        envelope =
          req.headers.get("content-encoding") === "gzip"
            ? await new Response(
                req.body.pipeThrough(new DecompressionStream("gzip")),
              ).text()
            : await req.text();
        return new Response("{}");
      },
    );
    Deno.env.set(
      "DREAM_EDGE_SENTRY_DSN",
      `http://public@127.0.0.1:${server.addr.port}/1`,
    );
    try {
      const { captureEdgeFailure } =
        await import("../functions/dream-api/monitoring.ts");
      const Sentry = await import("npm:@sentry/deno@11.5.0");
      captureEdgeFailure("chat", "stream_failed");
      await Sentry.flush(5000);
      assertEquals(envelope.includes("Private content omitted"), true);
      assertEquals(envelope.includes('"operation":"chat"'), true);
      for (const forbidden of [
        "authorization",
        "access_token",
        "user_metadata",
        '"request"',
        '"user"',
        '"breadcrumbs"',
      ])
        assertEquals(envelope.toLowerCase().includes(forbidden), false);
      await Sentry.close();
    } finally {
      Deno.env.delete("DREAM_EDGE_SENTRY_DSN");
      await server.shutdown();
    }
  },
);
Deno.test(
  "real PDF extractor reads a generated text PDF and releases resources",
  async () => {
    const content = "BT /F1 12 Tf 72 720 Td (Concepto PDF verificado) Tj ET";
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (let n = 0; n < objects.length; n++) {
      offsets.push(pdf.length);
      pdf += `${n + 1} 0 obj\n${objects[n]}\nendobj\n`;
    }
    const start = pdf.length;
    pdf += "xref\n0 6\n0000000000 65535 f \n";
    for (const offset of offsets.slice(1))
      pdf += String(offset).padStart(10, "0") + " 00000 n \n";
    pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
    const text = await extractAttachment({
      fileName: "notes.pdf",
      mimeType: "application/pdf",
      base64: btoa(pdf),
      signal: new AbortController().signal,
      admission: undefined,
    });
    assertEquals(text.includes("Concepto PDF verificado"), true);
  },
);

Deno.test("chat shortcut is optional, closed and only reaches the dynamic context", () => {
  assertEquals(chatShortcut(undefined), null);
  assertEquals(chatShortcut("eli5"), "eli5");
  for (const bad of ["", "ELI5", "system", 3, ["eli5"], { id: "eli5" }])
    assertThrows(() => chatShortcut(bad));
  assertEquals(Object.keys(CHAT_SHORTCUT_PROMPTS).sort(), [...CHAT_SHORTCUTS].sort());
  const context = dynamicContextFor([], "eli5");
  assertEquals(context.includes(CHAT_SHORTCUT_PROMPTS.eli5), true);
  assertEquals(context.includes("No des la solución"), true);
  assertEquals(dynamicContextFor([]).includes("Atajo"), false);
});
