// Maqueta de los esquemas visuales (docs/ESQUEMAS.md). La IA solo decide el
// contenido (supabase/functions/dream-api/schemes.mjs); aquí se decide el
// diseño de forma determinista: mismo esquema → misma maqueta.

export type SchemeBullet = { text: string; quote: string };
export type SchemeKind = "list" | "subcards" | "dates" | "formula" | "examples" | "mistakes" | "legacy";
export type SchemeSection = {
  heading: string;
  kind: SchemeKind;
  bullets: SchemeBullet[];
  subcards: { title: string; bullets: SchemeBullet[] }[];
  dates: { year: string; text: string; quote: string }[];
  formula: string;
  illustration_prompt: string | null;
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

// Ciclo de tonos pastel del ejemplo de Carlos. Los valores viven en
// app/esquema.css (claro y oscuro); aquí solo el orden.
export const PALETTE = [
  { id: "verde" },
  { id: "azul" },
  { id: "melocoton" },
  { id: "lila" },
  { id: "amarillo" },
  { id: "rosa" },
] as const;
export type Tone = (typeof PALETTE)[number]["id"];

export type SchemeCard = SchemeSection & { number: number; tone: Tone; illustration: boolean; height: number };
export type SchemeLayout = { cards: SchemeCard[]; columns: number[][] };

export const MAX_ILLUSTRATIONS = 4;
const NO_ILLUSTRATION: SchemeKind[] = ["dates", "formula"];

// Altura aproximada en px a 1/3 del ancho de escritorio (~360 px, ~40
// caracteres por línea). Solo sirve para repartir columnas.
const lines = (text: string, perLine = 40) => Math.max(1, Math.ceil(text.length / perLine));
export function estimateHeight(section: SchemeSection, illustration: boolean) {
  let h = 76;
  h += section.bullets.reduce((sum, b) => sum + lines(b.text) * 22 + 8, 0);
  h += section.subcards.reduce((sum, c) => sum + 52 + c.bullets.reduce((s, b) => s + lines(b.text, 34) * 21 + 6, 0), 0);
  h += section.dates.length * 40;
  if (section.formula) h += 64;
  if (illustration) h += 196;
  return h;
}

export function layoutScheme(scheme: Scheme, columnCount: number): SchemeLayout {
  let illustrations = 0;
  const cards = scheme.sections.map((section, index) => {
    const illustration =
      Boolean(section.illustration_prompt) && !NO_ILLUSTRATION.includes(section.kind) && illustrations < MAX_ILLUSTRATIONS;
    if (illustration) illustrations++;
    return {
      ...section,
      number: index + 1,
      tone: PALETTE[index % PALETTE.length].id,
      illustration,
      height: estimateHeight(section, illustration),
    };
  });
  const count = Math.max(1, Math.min(3, Math.floor(columnCount)));
  const columns: number[][] = Array.from({ length: count }, () => []);
  const heights = new Array(count).fill(0);
  // Cada tarjeta, por orden, va a la columna más baja: se leen 1, 2, 3… de
  // izquierda a derecha y las alturas quedan equilibradas.
  cards.forEach((card, index) => {
    const target = heights.indexOf(Math.min(...heights));
    columns[target].push(index);
    heights[target] += card.height + 20;
  });
  return { cards, columns };
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
