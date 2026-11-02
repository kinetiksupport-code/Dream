// Importar y exportar tarjetas en CSV/TSV (Bloque 4), el formato que usan
// Quizlet y Anki: una tarjeta por fila, «pregunta;respuesta». Acepta punto y
// coma, tabulador o coma, y comillas dobles. Todo en el navegador, sin IA.
export const CARD_SIDE_MAX = 300;
export const IMPORT_MAX_ROWS = 500;

export interface ParsedCards {
  rows: { front: string; back: string }[];
  skipped: number;
  truncated: boolean;
}

function splitRow(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === "") {
      quoted = true;
      cur = "";
    } else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function guessSeparator(lines: string[]): string {
  const sample = lines.slice(0, 20).join("\n");
  if (sample.includes("\t")) return "\t";
  if (sample.includes(";")) return ";";
  return ",";
}

export function parseCards(text: string): ParsedCards {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const sep = guessSeparator(lines);
  const rows: ParsedCards["rows"] = [];
  let skipped = 0;
  for (const line of lines) {
    const [front = "", ...rest] = splitRow(line, sep);
    const back = rest.join(sep === "," ? ", " : " ").trim();
    if (!front || !back || front.length > CARD_SIDE_MAX || back.length > CARD_SIDE_MAX) {
      skipped++;
      continue;
    }
    rows.push({ front, back });
  }
  return { rows: rows.slice(0, IMPORT_MAX_ROWS), skipped, truncated: rows.length > IMPORT_MAX_ROWS };
}

function cell(value: string) {
  return /[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function exportCards(cards: { front: string; back: string }[]): string {
  return cards.map((c) => `${cell(c.front)};${cell(c.back)}`).join("\n") + "\n";
}
