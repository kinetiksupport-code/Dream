import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { NextRequest } from "next/server";
import {
  COOKIES_MD,
  LEGAL_NOTICE_MD,
  PRIVACY_MD,
  TERMS_MD,
} from "../lib/legal-content";
import { LEGAL_LINKS, isLegalRoute } from "../lib/legal";
import {
  rehypeTableLabels,
  remarkLegalPlaceholders,
} from "../lib/legal-markdown";
import { middleware } from "../middleware";

const ALL = [PRIVACY_MD, TERMS_MD, COOKIES_MD, LEGAL_NOTICE_MD].join("\n");

function render(content: string): string {
  return renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      {
        remarkPlugins: [remarkGfm, remarkLegalPlaceholders],
        rehypePlugins: [rehypeTableLabels],
      },
      content,
    ),
  );
}

test("internal notes for Carlos are not published", () => {
  for (const note of [
    "[Carlos:",
    "Nota técnica",
    "Aviso importante",
    "Pendiente de decidir",
    "cambia este párrafo",
    "todavía no está disponible",
    "Accenture",
    "No lo ha revisado un abogado",
  ])
    assert.equal(ALL.includes(note), false, note);
});

test("placeholders for Carlos stay as they are", () => {
  for (const gap of ["[FECHA]", "[X meses]", "[REGIÓN, p. ej. UE]"])
    assert.ok(ALL.includes(gap), gap);
  assert.ok(LEGAL_NOTICE_MD.includes("**NIF:** [NIF]"));
  assert.ok(LEGAL_NOTICE_MD.includes("**Domicilio:** [DOMICILIO]"));
});

test("legal text keeps the key sentences of the document", () => {
  assert.ok(
    PRIVACY_MD.includes(
      "El responsable del tratamiento de tus datos es **Carlos Sánchez**, a título particular",
    ),
  );
  assert.ok(
    PRIVACY_MD.includes(
      "Para eliminar tu cuenta y todos tus datos, escríbenos a **hellodream@edudream.es** y lo haremos en un máximo de **30 días**.\n",
    ),
  );
  assert.ok(
    PRIVACY_MD.includes(
      "Los registros técnicos de uso y abuso se conservan **[X meses]**.\n",
    ),
  );
  assert.ok(TERMS_MD.includes("## 14. Ley aplicable"));
  assert.ok(TERMS_MD.includes("| Infracción | 1.ª vez | Reincidencia |"));
  assert.ok(COOKIES_MD.includes("`dream-theme` (localStorage)"));
  assert.ok(LEGAL_NOTICE_MD.includes("hellodream@edudream.es"));
  assert.ok(LEGAL_NOTICE_MD.includes("www.edudream.es"));
});

test("placeholders render as visible marks and table cells carry labels", () => {
  const html = render(PRIVACY_MD);
  assert.match(html, /<mark class="legal-placeholder">\[FECHA\]<\/mark>/);
  assert.match(
    html,
    /<strong><mark class="legal-placeholder">\[REGIÓN, p\. ej\. UE\]<\/mark><\/strong>/,
  );
  assert.match(
    html,
    /<td data-label="Para qué">Crear y proteger tu cuenta<\/td>/,
  );
  const notice = render(LEGAL_NOTICE_MD);
  assert.match(notice, /<mark class="legal-placeholder">\[NIF\]<\/mark>/);
  assert.match(notice, /<mark class="legal-placeholder">\[DOMICILIO\]<\/mark>/);
  assert.match(notice, /<a href="\/terminos">/);
  assert.match(notice, /<a href="\/privacidad">/);
  assert.match(notice, /<a href="\/cookies">/);
});

test("legal routes are public, also in maintenance mode", async () => {
  assert.deepEqual(
    LEGAL_LINKS.map((link) => link.href),
    ["/privacidad", "/terminos", "/cookies", "/aviso-legal"],
  );
  assert.equal(isLegalRoute("/privacidad"), true);
  assert.equal(isLegalRoute("/chat"), false);
  const previous = process.env.MAINTENANCE_MODE;
  process.env.MAINTENANCE_MODE = "true";
  try {
    for (const { href } of LEGAL_LINKS) {
      const response = await middleware(
        new NextRequest(`https://www.edudream.es${href}`),
      );
      assert.equal(response.headers.get("location"), null, href);
    }
    const blocked = await middleware(
      new NextRequest("https://www.edudream.es/chat"),
    );
    assert.equal(
      blocked.headers.get("location"),
      "https://www.edudream.es/maintenance",
    );
  } finally {
    if (previous === undefined) delete process.env.MAINTENANCE_MODE;
    else process.env.MAINTENANCE_MODE = previous;
  }
});
