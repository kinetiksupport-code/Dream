// Maqueta de los esquemas visuales (docs/ESQUEMAS.md). La IA solo decide el
// contenido (supabase/functions/dream-api/schemes.mjs); aquí se decide el
// diseño de forma determinista: mismo esquema → misma maqueta. Referencia:
// docs/esquemas/referencia-al-andalus.webp (el ejemplo de Carlos).

export type SchemeBullet = { text: string; quote: string };
export type SchemeKind = "list" | "subcards" | "dates" | "formula" | "examples" | "mistakes" | "legacy";
export type SchemeSection = {
  heading: string;
  period: string;
  kind: SchemeKind;
  intro: string;
  bullets: SchemeBullet[];
  subcards: { title: string; period: string; bullets: SchemeBullet[] }[];
  dates: { year: string; text: string; quote: string }[];
  formula: string;
  highlight: string;
  illustration_prompt: string | null;
  illustration_caption: string;
};
export type Scheme = {
  title: string;
  subtitle: string;
  subject: string;
  sections: SchemeSection[];
  key_ideas: string[];
  summary: string;
  closing: string;
};

// Tonos de las tarjetas, en el orden del ejemplo de Carlos (amarillo, azul,
// rojo, índigo…). Los valores viven en components/esquema/esquema.module.css.
export const PALETTE = ["amarillo", "azul", "rojo", "indigo", "celeste", "naranja"] as const;
export const SUBCARD_TONES = ["verde", "lila", "naranja"] as const;
export const PILL_TONES = ["lila", "verde", "azul", "amarillo", "verde", "lila", "amarillo", "azul", "naranja", "rojo"] as const;
export type Tone = (typeof PALETTE)[number] | "verde" | "lila";

export type SchemeCard = SchemeSection & {
  /** Número del círculo; null en «Patrimonio/Legado», que lleva icono. */
  number: number | null;
  tone: Tone;
  illustration: boolean;
  /** La caja de cierre («→ Fue una época…») va dentro de la primera tarjeta. */
  closing: string;
};
export type SchemeBlock =
  | { type: "section"; card: SchemeCard; height: number }
  | { type: "ideas"; ideas: string[]; height: number }
  | { type: "summary"; text: string; height: number };
export type SchemeLayout = { blocks: SchemeBlock[]; columns: number[][] };

export const MAX_ILLUSTRATIONS = 4;
const NO_ILLUSTRATION: SchemeKind[] = ["dates", "formula"];

// Altura aproximada en px a 1/3 del ancho de escritorio (~380 px, ~44
// caracteres por línea). Solo sirve para repartir columnas.
const lines = (text: string, perLine = 44) => Math.max(1, Math.ceil(text.length / perLine));
export function estimateHeight(card: SchemeCard) {
  let h = 96;
  if (card.intro) h += lines(card.intro) * 22 + 10;
  h += card.bullets.reduce((sum, b) => sum + lines(b.text) * 22 + 8, 0);
  // Las subtarjetas van en dos columnas: cuenta la más alta.
  const subs = card.subcards.map((c) => 60 + c.bullets.reduce((s, b) => s + lines(b.text, 22) * 19 + 6, 0));
  if (subs.length) h += Math.max(...subs) + (subs.length > 2 ? Math.min(...subs) : 0) + 50;
  h += card.dates.reduce((sum, d) => sum + lines(d.text, 32) * 22 + 22, 0);
  if (card.formula) h += 72;
  if (card.highlight) h += lines(card.highlight, 38) * 22 + 30;
  if (card.illustration) h += 200 + (card.illustration_caption ? 24 : 0);
  if (card.closing && !card.illustration) h += lines(card.closing, 38) * 24 + 30;
  return h;
}

export function layoutScheme(scheme: Scheme, columnCount: number): SchemeLayout {
  let illustrations = 0;
  let numbered = 0;
  const blocks: SchemeBlock[] = scheme.sections.map((section, index) => {
    const illustration =
      Boolean(section.illustration_prompt) && !NO_ILLUSTRATION.includes(section.kind) && illustrations < MAX_ILLUSTRATIONS;
    if (illustration) illustrations++;
    const card: SchemeCard = {
      ...section,
      number: section.kind === "legacy" ? null : ++numbered,
      tone: PALETTE[index % PALETTE.length],
      illustration,
      closing: index === 0 ? scheme.closing : "",
    };
    return { type: "section", card, height: estimateHeight(card) };
  });
  if (scheme.key_ideas.length)
    blocks.push({ type: "ideas", ideas: scheme.key_ideas, height: 84 + scheme.key_ideas.reduce((s, i) => s + lines(i, 40) * 23 + 10, 0) });
  if (scheme.summary) blocks.push({ type: "summary", text: scheme.summary, height: 96 + lines(scheme.summary, 40) * 27 });
  // «Patrimonio/Legado» cierra el esquema, como en el ejemplo: va el último.
  const legacy = blocks.findIndex((b) => b.type === "section" && b.card.kind === "legacy");
  if (legacy >= 0 && legacy < blocks.length - 1) blocks.push(...blocks.splice(legacy, 1));

  const count = Math.max(1, Math.min(3, Math.floor(columnCount)));
  return { blocks, columns: balanceColumns(blocks.map((b) => b.height), count) };
}

/**
 * Reparte los bloques en columnas para que acaben lo más igualadas posible.
 * Los primeros bloques abren una columna cada uno (1, 2, 3 de izquierda a
 * derecha); el resto se prueba en todas las combinaciones (como mucho 3^7,
 * determinista) conservando el orden de lectura dentro de cada columna. A
 * igualdad, gana la que pone cada bloque en la columna más a la izquierda.
 */
export function balanceColumns(heights: number[], count: number): number[][] {
  const gap = 18;
  if (count === 1) return [heights.map((_, i) => i)];
  const opening = heights.slice(0, count).map((h) => h + gap);
  const rest = heights.slice(count);
  let best: number[] | null = null;
  let bestSpread = Infinity;
  const choice: number[] = [];
  const walk = (i: number, totals: number[]) => {
    if (i === rest.length) {
      const spread = Math.max(...totals) - Math.min(...totals);
      if (spread < bestSpread) { bestSpread = spread; best = [...choice]; }
      return;
    }
    for (let c = 0; c < count; c++) {
      choice[i] = c;
      totals[c] += rest[i] + gap;
      walk(i + 1, totals);
      totals[c] -= rest[i] + gap;
    }
  };
  walk(0, opening);
  const columns: number[][] = Array.from({ length: count }, (_, c) => (c < heights.length ? [c] : []));
  (best ?? []).forEach((c, i) => columns[c].push(count + i));
  return columns;
}


/** Trozos con y sin negrita. Solo se reconoce **texto**; nada se interpreta como HTML. */
export function parseBold(text: string) {
  const parts: { text: string; bold: boolean }[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), bold: false });
    parts.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false });
  return parts;
}

/** Trozos de texto, negrita y matemática en línea ($…$, para KaTeX). */
export function parseInline(text: string) {
  return text.split(/(\$[^$\n]{1,200}\$)/g).flatMap((chunk) =>
    /^\$[^$\n]{1,200}\$$/.test(chunk)
      ? [{ text: chunk.slice(1, -1), bold: false, math: true }]
      : parseBold(chunk).map((part) => ({ ...part, math: false })),
  );
}
