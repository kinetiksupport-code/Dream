/** Normalize only explicitly delimited LaTeX, preserving fenced and inline code. */
export function normalizeMath(content: string) {
  return content
    .split(/(```[\s\S]*?```|`[^`]*`)/g)
    .map((part, index) =>
      index % 2
        ? part
        : part
            .replace(
              /\\\[([\s\S]*?)\\\]/g,
              (_match, math: string) => `\n$$\n${math}\n$$\n`,
            )
            .replace(
              /\\\(([\s\S]*?)\\\)/g,
              (_match, math: string) => `$${math}$`,
            ),
    )
    .join("");
}

const TEX_SYMBOLS: Record<string, string> = {
  cdot: "·", times: "×", div: "÷", pm: "±", mp: "∓", le: "≤", leq: "≤",
  ge: "≥", geq: "≥", neq: "≠", ne: "≠", approx: "≈", infty: "∞", to: "→",
  rightarrow: "→", Rightarrow: "⇒", leftrightarrow: "↔", circ: "°", degree: "°",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ", epsilon: "ε",
  theta: "θ", lambda: "λ", mu: "μ", pi: "π", rho: "ρ", sigma: "σ", Sigma: "Σ",
  phi: "φ", omega: "ω", Omega: "Ω", ldots: "…", dots: "…", cdots: "⋯",
  in: "∈", notin: "∉", subset: "⊂", cup: "∪", cap: "∩", forall: "∀", exists: "∃",
};

/** Read one {group} (or a single token) starting at i. */
function texGroup(tex: string, i: number): [string, number] {
  while (tex[i] === " ") i++;
  if (tex[i] !== "{") {
    if (tex[i] === "\\") {
      const m = /^\\[A-Za-z]+/.exec(tex.slice(i));
      if (m) return [m[0], i + m[0].length];
    }
    return [tex[i] ?? "", i + 1];
  }
  let depth = 0;
  for (let j = i; j < tex.length; j++) {
    if (tex[j] === "{") depth++;
    else if (tex[j] === "}" && --depth === 0) return [tex.slice(i + 1, j), j + 1];
  }
  return [tex.slice(i + 1), tex.length];
}

const simple = (s: string) => (/^[\p{L}\p{N},.]+$/u.test(s) ? s : `(${s})`);

/**
 * LaTeX → plain text for copying a formula: \frac{246}{100} → 246/100,
 * \sqrt{x} → √x, x^{2} → x^2. Not a full TeX parser: enough for school maths.
 */
export function texToPlain(tex: string): string {
  let out = "";
  let i = 0;
  while (i < tex.length) {
    const ch = tex[i];
    if (ch === "\\") {
      const m = /^\\([A-Za-z]+|.)/.exec(tex.slice(i));
      const name = m ? m[1] : "";
      i += m ? m[0].length : 1;
      if (["frac", "dfrac", "tfrac", "cfrac"].includes(name)) {
        const [a, j] = texGroup(tex, i);
        const [b, k] = texGroup(tex, j);
        out += `${simple(texToPlain(a))}/${simple(texToPlain(b))}`;
        i = k;
      } else if (name === "sqrt") {
        let index = "";
        if (tex[i] === "[") {
          const end = tex.indexOf("]", i);
          index = tex.slice(i + 1, end);
          i = end + 1;
        }
        const [a, j] = texGroup(tex, i);
        const inner = simple(texToPlain(a));
        out += index ? `${simple(texToPlain(index))}√${inner}` : `√${inner}`;
        i = j;
      } else if (["text", "mathrm", "mathbf", "textbf", "mathit", "operatorname", "overline", "underline", "boxed"].includes(name)) {
        const [a, j] = texGroup(tex, i);
        const inner = texToPlain(a);
        out += name === "overline" ? [...inner].map((c) => c + "̅").join("") : inner;
        i = j;
      } else if (["left", "right", "displaystyle", "big", "Big", "bigl", "bigr"].includes(name)) {
        // size hints: drop
      } else if ([",", ";", ":", "!", " ", "quad", "qquad"].includes(name)) {
        out += name === "!" ? "" : " ";
      } else if (name in TEX_SYMBOLS) out += TEX_SYMBOLS[name];
      else if (name.length === 1) out += name;
      else out += name;
    } else if (ch === "^" || ch === "_") {
      const [a, j] = texGroup(tex, i + 1);
      const inner = texToPlain(a);
      out += ch + (inner.length > 1 ? `(${inner})` : inner);
      i = j;
    } else if (ch === "{" || ch === "}") i++;
    else {
      out += ch;
      i++;
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * What lands in the clipboard when copying part of an answer: each formula
 * as plain text (from its TeX source) instead of KaTeX's two copies.
 */
export function plainCopyText(fragment: DocumentFragment): string | null {
  const formulas = fragment.querySelectorAll(".katex");
  const partial = fragment.querySelector(".katex-mathml, .katex-html");
  if (!formulas.length && !partial) return null;
  for (const el of formulas) {
    const tex = el.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? "";
    el.replaceWith(fragment.ownerDocument.createTextNode(texToPlain(tex)));
  }
  // A selection that starts inside a formula: keep only its visible half.
  fragment.querySelectorAll(".katex-mathml").forEach((el) => el.remove());
  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:-9999px;white-space:pre-wrap";
  holder.append(fragment);
  document.body.append(holder);
  const text = holder.innerText;
  holder.remove();
  return text;
}

/** An answer's Markdown with each formula as plain text (the «Copiar» button). */
export function plainMath(markdown: string): string {
  return normalizeMath(markdown)
    .split(/(```[\s\S]*?```|`[^`]*`)/g)
    .map((part, index) =>
      index % 2
        ? part
        : part
            .replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (_m, tex: string) => texToPlain(tex))
            .replace(/\$([^$\n]+)\$/g, (_m, tex: string) => texToPlain(tex)),
    )
    .join("");
}
