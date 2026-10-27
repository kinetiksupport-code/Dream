import type { QuizWidget, SchemeWidget, WebSource } from "./types";
export function parseDreamContent(content: string) {
  const widgets: QuizWidget[] = [];
  const schemes: SchemeWidget[] = [];
  const sources: WebSource[] = [];
  const requestTest = content.includes("<!--DREAM_ACTION:TEST-->");
  const text = content
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
    .replace(/<!--DREAM_(?:WIDGET|ACTION|SOURCES):[\s\S]*$/g, "");
  return { text, widgets, schemes, requestTest, sources: sources.slice(0, 5) };
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
