// Cambios del editor de esquemas (components/esquema/esquema-page.tsx). Puras:
// devuelven un esquema nuevo y no tocan el anterior (deshacer/rehacer).
import type { Scheme, Tone } from "./esquema";

export type Path = (string | number)[];
type Node = Record<string | number, unknown>;

function cloneScheme(s: Scheme): Scheme {
  return structuredClone(s);
}
function parentOf(root: Node, path: Path) {
  let node: Node = root;
  for (const key of path.slice(0, -1)) {
    const next = node[key];
    if (next === null || typeof next !== "object") return null;
    node = next as Node;
  }
  return node;
}

/** Cambia un texto. Rutas que no existen se ignoran. */
export function setAt(s: Scheme, path: Path, value: string): Scheme {
  const out = cloneScheme(s);
  const parent = parentOf(out as unknown as Node, path);
  if (!parent) return s;
  parent[path[path.length - 1]] = value;
  return out;
}

/** Añade al final de la lista en `path`. */
export function insertAt(s: Scheme, path: Path, item: unknown): Scheme {
  const out = cloneScheme(s);
  const parent = parentOf(out as unknown as Node, [...path, 0]);
  if (!Array.isArray(parent)) return s;
  parent.push(structuredClone(item));
  return out;
}

/** Quita el elemento en `path` (el último de la ruta es su posición). */
export function removeAt(s: Scheme, path: Path): Scheme {
  const out = cloneScheme(s);
  const parent = parentOf(out as unknown as Node, path);
  const index = path[path.length - 1];
  if (!Array.isArray(parent) || typeof index !== "number") return s;
  if (path.length === 2 && path[0] === "sections" && parent.length <= 1) return s;
  parent.splice(index, 1);
  return out;
}

export function moveSection(s: Scheme, index: number, delta: -1 | 1): Scheme {
  const to = index + delta;
  if (to < 0 || to >= s.sections.length) return s;
  const out = cloneScheme(s);
  const [section] = out.sections.splice(index, 1);
  out.sections.splice(to, 0, section);
  return out;
}

export function setTone(s: Scheme, index: number, tone: Tone): Scheme {
  if (!s.sections[index]) return s;
  const out = cloneScheme(s);
  out.sections[index].tone = tone;
  return out;
}

/** Historial para deshacer y rehacer (máx. 50 pasos). */
export interface History {
  past: Scheme[];
  present: Scheme;
  future: Scheme[];
}
export const historyOf = (present: Scheme): History => ({ past: [], present, future: [] });
export function commit(h: History, next: Scheme): History {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-50), present: next, future: [] };
}
export function undo(h: History): History {
  const previous = h.past.at(-1);
  return previous ? { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] } : h;
}
export function redo(h: History): History {
  const [next, ...rest] = h.future;
  return next ? { past: [...h.past, h.present], present: next, future: rest } : h;
}
