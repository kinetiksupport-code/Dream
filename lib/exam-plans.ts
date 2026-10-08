/** Browser-only exam index. No document bytes or academic mastery data are stored here.
 * Replace with authenticated dream-api exam_plans actions when the backend supports them.
 */
export type ExamMode = "practice" | "exam";
export interface SavedExamTest {
  id: string;
  mode: ExamMode;
  createdAt: string;
  title: string;
}
export interface SavedExam {
  id: string;
  title: string;
  subject: string;
  topics: string[];
  date: string;
  createdAt: string;
  conversationId: string;
  files: { name: string; attachmentId: string }[];
  tests: SavedExamTest[];
}
const PREFIX = "dream-exams-v1:";
function key(userId: string) { return PREFIX + userId; }
export function readExams(userId: string): SavedExam[] {
  try {
    const raw = localStorage.getItem(key(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is SavedExam =>
      e && typeof e === "object" && typeof e.id === "string" &&
      typeof e.title === "string" && typeof e.subject === "string" &&
      typeof e.date === "string" && typeof e.conversationId === "string" &&
      Array.isArray(e.topics) && Array.isArray(e.tests) && Array.isArray(e.files)
    ).sort((a, b) => a.date.localeCompare(b.date));
  } catch { return []; }
}
export function saveExams(userId: string, exams: SavedExam[]) {
  try { localStorage.setItem(key(userId), JSON.stringify(exams)); }
  catch { throw new Error("No se ha podido guardar este examen en el dispositivo. Revisa el espacio disponible y la configuración de privacidad del navegador."); }
}
export function saveExam(userId: string, exam: SavedExam) {
  const existing = readExams(userId);
  saveExams(userId, [exam, ...existing.filter((item) => item.id !== exam.id)]);
}
export function removeExam(userId: string, id: string) {
  saveExams(userId, readExams(userId).filter((item) => item.id !== id));
}
export function daysUntil(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  const today = new Date();
  const current = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.ceil((target-current)/86400000);
}
export function examDateLabel(iso: string) {
  const [y,m,d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat("es-ES", { day:"numeric", month:"long", year:"numeric" }).format(new Date(y,m-1,d));
}
