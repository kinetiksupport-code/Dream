/**
 * Text that is still arriving can end halfway through a formula, a link or
 * a bold run. Rendering it
 * as is makes KaTeX flash raw TeX («\[x^2-5») and then jump to the formula, so
 * while streaming we hold back an unclosed math block or inline formula until
 * its closing delimiter arrives. Finished messages are never touched.
 */
export function settleStreaming(text: string): string {
  let out = text;
  for (const [open, close] of [
    ["\\[", "\\]"],
    ["\\(", "\\)"],
  ] as const) {
    const start = out.lastIndexOf(open);
    if (start !== -1 && out.indexOf(close, start + open.length) === -1)
      out = out.slice(0, start);
  }
  // $$…$$ blocks: an odd count means the last one is still open.
  const blocks = out.split("$$");
  if (blocks.length % 2 === 0) out = blocks.slice(0, -1).join("$$");
  // A link that has not closed yet («[texto](https://…») waits whole, so it
  // never shows as brackets and then jumps to a link (P5).
  const link = out.search(/\[[^\]\n]*(\]\([^)\s]*)?$/);
  if (link !== -1) out = out.slice(0, link);
  // Same with bold: an odd «**» is still open.
  const bold = out.split("**");
  if (bold.length % 2 === 0) out = bold.slice(0, -1).join("**");
  return out.replace(/\s+$/, "");
}
