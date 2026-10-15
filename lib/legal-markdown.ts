// Small unified plugins for the legal pages. Minimal local node types keep them
// free of extra dependencies.

interface TreeNode {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: TreeNode[];
  data?: Record<string, unknown>;
}

const PLACEHOLDER = /\[[^\]\n]+\]/g;

/**
 * remark: wraps gaps that Carlos still has to fill, such as [FECHA] or [NIF],
 * in <mark class="legal-placeholder"> so they stay visible on the page.
 */
export function remarkLegalPlaceholders() {
  return (tree: unknown) => {
    const visit = (node: TreeNode) => {
      if (!node.children || node.type === "link") return;
      const next: TreeNode[] = [];
      for (const child of node.children) {
        if (child.type !== "text" || !child.value) {
          visit(child);
          next.push(child);
          continue;
        }
        let last = 0;
        for (const match of child.value.matchAll(PLACEHOLDER)) {
          const start = match.index ?? 0;
          if (start > last)
            next.push({ type: "text", value: child.value.slice(last, start) });
          next.push({
            type: "legalPlaceholder",
            data: {
              hName: "mark",
              hProperties: { className: ["legal-placeholder"] },
              hChildren: [{ type: "text", value: match[0] }],
            },
          });
          last = start + match[0].length;
        }
        if (last === 0) next.push(child);
        else if (last < child.value.length)
          next.push({ type: "text", value: child.value.slice(last) });
      }
      node.children = next;
    };
    visit(tree as TreeNode);
  };
}

function textOf(node: TreeNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

function elements(node: TreeNode | undefined, tagName: string): TreeNode[] {
  return (node?.children ?? []).filter(
    (child) => child.type === "element" && child.tagName === tagName,
  );
}

/**
 * rehype: copies each column header into data-label on its cells, so narrow
 * screens can show every row as a stacked card (see legal.module.css).
 */
export function rehypeTableLabels() {
  return (tree: unknown) => {
    const visit = (node: TreeNode) => {
      if (node.type === "element" && node.tagName === "table") {
        const head = elements(node, "thead")[0];
        const labels = elements(elements(head, "tr")[0], "th").map(textOf);
        for (const row of elements(elements(node, "tbody")[0], "tr"))
          elements(row, "td").forEach((cell, index) => {
            if (labels[index])
              cell.properties = {
                ...cell.properties,
                dataLabel: labels[index],
              };
          });
        return;
      }
      node.children?.forEach(visit);
    };
    visit(tree as TreeNode);
  };
}
