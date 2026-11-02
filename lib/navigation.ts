import { studyStepsEnabled } from "./study-steps";
// Route → navigation mapping shared by the sidebar and the mobile tab bar.
export type NavKey =
  | "home"
  | "chat"
  | "tasks"
  | "notes"
  | "exams"
  | "history"
  | "settings"
  | "more";
/** Which navigation entry a route belongs to (pure, unit-tested). */
export function activeNav(
  pathname: string,
  params: { c?: string | null; view?: string | null },
): NavKey | null {
  if (pathname === "/chat") {
    if (params.view === "recent" || params.view === "tests") return "history";
    return params.c ? "chat" : "home";
  }
  if (pathname.startsWith("/tasks")) return "tasks";
  if (pathname.startsWith("/notes")) return "notes";
  if (pathname.startsWith("/exams")) return "exams";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/more")) return "more";
  return null;
}

/** Routes that take the whole screen (tests and exam sessions), like the canvas. */
export function isFocusRoute(pathname: string) {
  return (
    pathname.startsWith("/tests/") ||
    // Asistente de crear examen a pantalla completa (§5.1).
    pathname === "/exams/new" ||
    /^\/exams\/[^/]+\/sessions\//.test(pathname) ||
    // La lección de la ruta (0.6), a pantalla completa con el flag encendido.
    (studyStepsEnabled() && /^\/exams\/[^/]+\/study\//.test(pathname))
  );
}

