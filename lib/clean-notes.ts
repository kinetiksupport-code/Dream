// «Apuntes»: los apuntes del alumno pasados a limpio (docs/APUNTES-LIMPIOS.md).
// Tipos del JSON que guarda dream-api (clean-notes.mjs), el detector del chat y
// el texto en Markdown. El diseño de la hoja está en components/apuntes-limpios/.

export interface NotesBullet {
  term: string;
  text: string;
  quote?: string;
}
export interface NotesSection {
  heading: string;
  period: string;
  bullets: NotesBullet[];
}
export interface NotesPage {
  sections: NotesSection[];
  flow: { label: string; period: string }[];
  key_idea: { text: string; quote?: string };
  unreadable: string[];
  doubts: { text: string; quote?: string }[];
}
export interface CleanNotes {
  title: string;
  pages: NotesPage[];
  total: number;
  truncated?: boolean;
}
export interface CleanNotesRow {
  id: string;
  title: string;
  content: CleanNotes;
  total_pages: number;
  done: number;
}

/**
 * El alumno pide sus apuntes pasados a limpio («pásame a limpio estos
 * apuntes», «pon en limpio mis apuntes», «ordena mis apuntes»). No cuenta si
 * pide un esquema, un resumen o un test.
 */
export function wantsCleanNotes(prompt: string) {
  const text = prompt.toLowerCase();
  if (/\b(esquema|test|examen|resumen|res[uú]me)\b/.test(text)) return false;
  if (/\b(pasa(r|me|lo|los)?|p[aá]sa(me|lo|los)|pon(er|me|lo|los)?|p[oó]n(me|lo|los)|escr[ií]be(me|los)?)\b[^.?!]{0,30}\ben limpio\b/.test(text)) return true;
  if (/\ba limpio\b/.test(text) && /\bapuntes|notas\b/.test(text)) return true;
  return /\b(ordena(r|me)?|ord[eé]na(me|los))\b[^.?!]{0,20}\b(mis |estos |los )?(apuntes|notas)\b/.test(text);
}

/** Numeración seguida de los apartados entre páginas (1, 2, 3… sin volver a 1). */
export function sectionNumbers(pages: NotesPage[]) {
  let n = 0;
  return pages.map((p) => p.sections.map(() => ++n));
}

/** Los apuntes limpios en Markdown (para copiarlos en otro sitio). */
export function notesMarkdown(notes: CleanNotes) {
  const out: string[] = [`# ${notes.title}`];
  const numbers = sectionNumbers(notes.pages);
  notes.pages.forEach((page, p) => {
    page.sections.forEach((s, i) => {
      out.push("", `## ${numbers[p][i]}. ${s.heading}${s.period ? ` (${s.period})` : ""}`);
      s.bullets.forEach((b) => out.push(`- ${b.term ? `**${b.term}:** ` : ""}${b.text}`));
    });
    if (page.flow.length) out.push("", page.flow.map((f) => `[${f.label}${f.period ? ` (${f.period})` : ""}]`).join(" → "));
    if (page.key_idea.text) out.push("", `> **Idea clave:** ${page.key_idea.text}`);
  });
  out.push("", "_Hecho por Dream a partir de tus apuntes. Revísalo._");
  return out.join("\n") + "\n";
}
