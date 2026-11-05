import type { GameWidget, NotesWidget, QuizWidget, SchemeWidget, WebSource } from "./types";
export function parseDreamContent(content: string) {
  const widgets: QuizWidget[] = [];
  const schemes: SchemeWidget[] = [];
  const games: GameWidget[] = [];
  const notes: NotesWidget[] = [];
  const sources: WebSource[] = [];
  const requestTest = content.includes("<!--DREAM_ACTION:TEST-->");
  let doc: { title: string; words: number } | null = null;
  const text = content
    // Documento largo de Dream (apuntes, resumen): título y palabras, para descargarlo como .md.
    .replace(/<!--DREAM_DOC:([\s\S]*?)-->/g, (_, raw: string) => {
      try {
        const v = JSON.parse(raw) as { title?: unknown; words?: unknown };
        if (typeof v.title === "string") doc = { title: v.title.slice(0, 90), words: Number(v.words) || 0 };
      } catch {}
      return "";
    })
    .replace(/<!--DREAM_WIDGET:([\s\S]*?)-->/g, (_, raw: string) => {
      try {
        const value: unknown = JSON.parse(raw);
        const v = value as Record<string, unknown> | null;
        if (
          v &&
          v.type === "scheme" &&
          typeof v.schemeId === "string" &&
          /^[0-9a-f-]{36}$/i.test(v.schemeId) &&
          typeof v.title === "string"
        )
          schemes.push({
            type: "scheme",
            schemeId: v.schemeId,
            title: v.title.slice(0, 120),
            subject: typeof v.subject === "string" ? v.subject.slice(0, 60) : undefined,
            sections: Number.isInteger(v.sections) ? (v.sections as number) : undefined,
          });
        else if (
          v &&
          v.type === "notes" &&
          typeof v.notesId === "string" &&
          /^[0-9a-f-]{36}$/i.test(v.notesId) &&
          typeof v.title === "string"
        )
          notes.push({
            type: "notes",
            notesId: v.notesId,
            title: v.title.slice(0, 120),
            pages: Number.isInteger(v.pages) ? (v.pages as number) : undefined,
          });
        else if (
          v &&
          v.type === "game" &&
          typeof v.gameId === "string" &&
          /^[0-9a-f-]{36}$/i.test(v.gameId) &&
          typeof v.title === "string" &&
          (v.kind === "classify" || v.kind === "match")
        )
          games.push({
            type: "game",
            gameId: v.gameId,
            title: v.title.slice(0, 120),
            kind: v.kind,
            count: Number.isInteger(v.count) ? (v.count as number) : undefined,
          });
        else if (
          value &&
          typeof value === "object" &&
          "type" in value &&
          value.type === "quiz" &&
          "testId" in value &&
          typeof value.testId === "string" &&
          /^[0-9a-f-]{36}$/i.test(value.testId) &&
          "title" in value &&
          typeof value.title === "string"
        )
          widgets.push(value as QuizWidget);
      } catch {}
      return "";
    })
    // Pages the server searched: shown apart, never inside the answer.
    .replace(/<!--DREAM_SOURCES:([\s\S]*?)-->/g, (_, raw: string) => {
      sources.push(...parseSources(raw));
      return "";
    })
    .replace(/<!--DREAM_ACTION:TEST-->/g, "")
    .replace(/<!--DREAM_(?:WIDGET|ACTION|SOURCES|DOC):[\s\S]*$/g, "");
  return { text, widgets, schemes, games, notes, requestTest, sources: sources.slice(0, 5), doc: doc ?? longDocument(text) };
}

/** Misma regla que dream-api (long-text.mjs): respuesta larga con forma de documento. */
export function longDocument(text: string): { title: string; words: number } | null {
  const t = text.trim();
  const shaped = /^\s{0,3}#{1,3}\s+\S/m.test(t) || (t.match(/^\s*([-*•]|\d+[.)])\s+/gm) ?? []).length >= 6;
  if (t.length < 2500 || !shaped) return null;
  const line = t.split("\n").map((l) => l.trim()).find((l) => /^#{1,3}\s+\S/.test(l)) ?? t.split("\n")[0];
  const title = line.replace(/^#+\s*/, "").replace(/[*_`]/g, "").trim().slice(0, 90) || "Documento";
  return { title, words: (t.match(/[\p{L}\p{N}]+/gu) ?? []).length };
}

function parseSources(raw: string): WebSource[] {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") return [];
    const { title, url } = item as Record<string, unknown>;
    if (typeof url !== "string" || url.length > 500) return [];
    try {
      if (!["https:", "http:"].includes(new URL(url).protocol)) return [];
    } catch {
      return [];
    }
    return [{ url, title: typeof title === "string" ? title.slice(0, 200) : "" }];
  });
}
