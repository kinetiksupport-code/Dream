// Texto largo pegado en el chat → archivo .md (prompt «ahorrar tokens», 6),
// como el «texto pegado» de Claude: no va dentro del mensaje, se sube por el
// camino de adjuntos que ya existe y la IA solo lee los trozos que hacen falta.

/** A partir de aquí lo pegado (o escrito seguido) se guarda como archivo. */
export const PASTE_LIMIT = 1500;

const PASTED = /^texto-pegado-(\d+)\.md$/;
export const isPastedName = (name: string) => PASTED.test(name);

export const wordCount = (text: string) => (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;

/** El siguiente número libre: texto-pegado-1.md, texto-pegado-2.md… */
export function nextPastedNumber(names: string[]) {
  const used = names.map((n) => Number(PASTED.exec(n)?.[1] ?? 0));
  return Math.max(0, ...used) + 1;
}

export function pastedFile(text: string, n: number) {
  return new File([text], `texto-pegado-${n}.md`, { type: "text/markdown" });
}

/** «2.340 palabras» con el separador de miles de España. */
export const wordsLabel = (n: number) => `${n.toLocaleString("es-ES", { useGrouping: true })} ${n === 1 ? "palabra" : "palabras"}`;
