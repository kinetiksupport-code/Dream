import type { QuizWidget } from "./types";
export function parseDreamContent(content: string) {
  const widgets: QuizWidget[] = [];
  const requestTest = content.includes("<!--DREAM_ACTION:TEST-->");
  const text = content
    .replace(/<!--DREAM_WIDGET:([\s\S]*?)-->/g, (_, raw: string) => {
      try {
        const value: unknown = JSON.parse(raw);
        if (
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
    .replace(/<!--DREAM_ACTION:TEST-->/g, "")
    .replace(/<!--DREAM_(?:WIDGET|ACTION):[\s\S]*$/g, "");
  return { text, widgets, requestTest };
}
