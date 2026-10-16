import type { Element, ElementContent, Root, RootContent } from "hast";

/**
 * rehype plugins for the Markdown pipeline (no new packages).
 *
 * rehypeRevealWords wraps every word of an answer in <span data-w>, so the
 * reveal (components/message.tsx) fades words in by toggling a class, without
 * re-rendering React. The tree is the final one from the first paint: when
 * the reveal ends nothing is re-rendered and nothing moves. A KaTeX formula
 * is one unit (it is never split).
 */
function isFormula(el: Element) {
  const c = el.properties?.className;
  return (
    Array.isArray(c) && c.some((x) => x === "katex" || x === "katex-display")
  );
}
function wrap(node: Root | Element) {
  const out: (RootContent | ElementContent)[] = [];
  for (const child of node.children) {
    if (child.type === "text") {
      for (const part of child.value.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) out.push({ type: "text", value: part });
        else
          out.push({
            type: "element",
            tagName: "span",
            properties: { dataW: "" },
            children: [{ type: "text", value: part }],
          });
      }
    } else if (child.type === "element") {
      if (isFormula(child))
        child.properties = { ...child.properties, dataW: "" };
      else wrap(child);
      out.push(child);
    } else out.push(child);
  }
  node.children = out as typeof node.children;
}
export function rehypeRevealWords() {
  return (tree: Root) => wrap(tree);
}

/**
 * «1. Título» headings become learning steps. It used to be decided in the
 * h3 component from its string children; with words wrapped there are no
 * string children, so it is decided here, before the words are wrapped.
 */
const STEP = /^\d{1,2}\s*[/.]/;
function markSteps(node: Root | Element) {
  for (const child of node.children) {
    if (child.type !== "element") continue;
    if (
      child.tagName === "h3" &&
      child.children.some((c) => c.type === "text" && STEP.test(c.value))
    ) {
      const c = child.properties?.className;
      child.properties = {
        ...child.properties,
        className: [...(Array.isArray(c) ? c : []), "learning-step"],
      };
    }
    markSteps(child);
  }
}
export function rehypeLearningSteps() {
  return (tree: Root) => markSteps(tree);
}
