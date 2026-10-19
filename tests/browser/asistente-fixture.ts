import type { Page, Route } from "@playwright/test";
import { mock } from "./design-fixture";
// dream-api simulada para el asistente de examen (PR 3): un borrador con
// estado que cambia con cada acción. Solo para pruebas.

export const EXAM_ID = "77777777-7777-4777-8777-777777777777";
export type Call = { action: string; body: Record<string, unknown> };
export const inDays = (n: number) => {
  const d = new Date(Date.now() + n * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export interface WizardOpts {
  /** Characters the analysis reports (below 3.000 → «pocos apuntes»). */
  chars?: number;
  /** exam_identify fails with this status. */
  identifyFails?: number;
  /** Existing draft (resume) instead of starting empty. */
  draft?: Record<string, unknown> | null;
  /** Delay (ms) per action. */
  delay?: Partial<Record<string, number>>;
  /** QR: files the phone sends after this many status polls. */
  phoneAfter?: number;
  calls?: Call[];
}

const material = (id: string, name: string, size = 120_000) => ({
  id,
  file_name: name,
  mime_type: "application/pdf",
  size_bytes: size,
  status: "processed",
});

export function baseExam(extra: Record<string, unknown> = {}) {
  return {
    id: EXAM_ID,
    title: "",
    subject: "",
    exam_date: "",
    topics: [] as string[],
    difficulties: "",
    goal: "",
    daily_minutes: 45,
    status: "draft",
    conversation_id: null as string | null,
    plan_error: null,
    units: [] as unknown[],
    materials: [] as ReturnType<typeof material>[],
    sessions: [],
    target_grade: null as number | null,
    wizard_step: "upload",
    few_notes_ack: false,
    ...extra,
  };
}

export async function wizard(page: Page, o: WizardOpts = {}) {
  await mock(page);
  let exam = o.draft === null || o.draft === undefined ? null : baseExam(o.draft);
  let attachments = 0;
  let polls = 0;
  const calls = o.calls ?? [];
  await page.route("**/functions/v1/dream-api", async (route: Route) => {
    const b = route.request().postDataJSON() as Record<string, unknown>;
    const action = String(b.action);
    if (
      action !== "attachment_upload" &&
      !action.startsWith("exam_") &&
      !action.startsWith("upload_session")
    )
      return route.fallback();
    calls.push({ action, body: b });
    const wait = o.delay?.[action];
    if (wait) await new Promise((r) => setTimeout(r, wait));
    const ok = (json: unknown) => route.fulfill({ json });
    switch (action) {
      case "exam_create":
        exam = baseExam({ id: b.exam_id });
        return ok({ exam });
      case "exam_get":
        return exam ? ok({ exam }) : route.fulfill({ status: 404, json: { error: "Examen no encontrado." } });
      case "exam_upload_start":
        exam = { ...exam!, conversation_id: "88888888-8888-4888-8888-888888888888" };
        return ok({ conversation_id: exam.conversation_id });
      case "attachment_upload":
        attachments++;
        return ok({ attachment: { id: `99999999-9999-4999-8999-99999999999${attachments}`, file_name: b.file_name } });
      case "exam_material_add":
        exam = {
          ...exam!,
          materials: [...exam!.materials, material(String(b.attachment_id), `archivo-${exam!.materials.length + 1}.pdf`)],
        };
        return ok({ exam });
      case "exam_material_remove":
        exam = { ...exam!, materials: exam!.materials.filter((m) => m.id !== b.attachment_id) };
        return ok({ exam });
      case "exam_analyze":
        return ok({ analysis: { files: exam!.materials.length, chars: o.chars ?? 12_000 } });
      case "exam_draft_update": {
        const { action: _a, exam_id: _e, ...fields } = b;
        void _a;
        void _e;
        exam = { ...exam!, ...(fields as object) };
        if (typeof fields.target_grade === "number")
          exam.goal = `Sacar un ${String(fields.target_grade).replace(".", ",")} sobre 10.`;
        return ok({ exam });
      }
      case "exam_identify":
        if (o.identifyFails)
          return route.fulfill({
            status: o.identifyFails,
            json: { error: "La IA no está disponible ahora.", code: "dream_rpm", retry_after: 30 },
          });
        exam = {
          ...exam!,
          title: "Ecuaciones de segundo grado",
          subject: "Matemáticas",
          topics: ["Discriminante", "Fórmula general", "Factorización"],
          wizard_step: "identify",
        };
        return ok({
          exam,
          identity: { title: exam.title, subject: exam.subject, topics: exam.topics },
        });
      case "exam_prepare":
        exam = {
          ...exam!,
          status: "ready",
          units: ["La ecuación y sus partes", "El discriminante", "La fórmula general", "Factorizar", "Problemas"].map(
            (title, i) => ({
              id: `55555555-5555-4555-8555-55555555550${i}`,
              position: i,
              title,
              topic: "Ecuaciones",
              summary: "Comprende la idea.",
              estimated_minutes: 15 + i * 5,
              status: "pending",
              conversation_id: null,
            }),
          ),
        };
        return ok({ exam });
      case "exam_delete":
        exam = null;
        return ok({ ok: true });
      case "upload_session_create":
        return ok({
          session: {
            id: "abababab-abab-4bab-8bab-abababababab",
            token: "q3Zr-9_xK2mPa7LbV0cT1uWnE8sYdHjF4gOiR6kXyQe",
            url: "/subir#q3Zr-9_xK2mPa7LbV0cT1uWnE8sYdHjF4gOiR6kXyQe",
            expires_at: new Date(Date.now() + 600_000).toISOString(),
            ttl_seconds: 600,
            max_uploads: 10,
          },
        });
      case "upload_session_status": {
        polls++;
        const phone = o.phoneAfter !== undefined && polls > o.phoneAfter;
        const files = phone
          ? [{ id: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd", attachment_id: "efefefef-efef-4fef-8fef-efefefefefef", file_name: "foto-pizarra.jpg", size_bytes: 210_000, status: "processed", created_at: new Date().toISOString() }]
          : [];
        if (phone && !exam!.materials.some((m) => m.id === files[0].attachment_id))
          exam = { ...exam!, materials: [...exam!.materials, material(files[0].attachment_id, "foto-pizarra.jpg", 210_000)] };
        return ok({
          session: {
            id: "abababab-abab-4bab-8bab-abababababab",
            state: phone ? "connected" : "open",
            connected: polls > 1,
            connected_at: null,
            expires_at: new Date(Date.now() + 600_000).toISOString(),
            uploads: files.length,
            max_uploads: 10,
            files,
          },
        });
      }
      case "upload_session_close":
      case "upload_session_renew":
        return ok({ ok: true, session: { id: "x", expires_at: new Date(Date.now() + 600_000).toISOString() } });
      default:
        return route.fallback();
    }
  });
  return { calls, current: () => exam };
}

export const PDF = {
  name: "tema4.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\n% apuntes de prueba\n"),
};
export const PHOTO = {
  name: "image.jpg",
  mimeType: "image/jpeg",
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]),
};
