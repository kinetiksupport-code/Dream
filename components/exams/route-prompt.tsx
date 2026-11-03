"use client";
// Pop-up «Estudia mejor tus exámenes creándote una ruta de estudio» (prompt de
// la ruta, 0.13). Sale tras crear un examen sin ruta («Tu examen está listo») y,
// como mucho una vez más, al abrir ese examen si sigue sin ruta.
// - 6 elementos como máximo: Orb, título exacto, una línea, «Crear mi ruta de
//   estudio», «Ahora no» y la X. Sin contadores, ofertas ni urgencia.
// - No sale: con ruta, con el flag de la ruta con IA apagado, sin apuntes o
//   sin fecha, encima de otro diálogo, o si ya salió en esta sesión. «Ahora
//   no» o la X lo ocultan 7 días en ese examen y luego solo sale una vez más.
// - Se guarda solo qué examen lo vio y cuándo (id y fecha, sin contenido), en
//   este navegador; si el almacenamiento falla, no sale.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { DreamExam } from "@/lib/exam-plans";
import { aiRouteEnabled, studyStepsEnabled } from "@/lib/study-steps";
import { Modal } from "../modal";
import { ROUTE_PROMPT_TITLE } from "@/lib/route-prompt-title";
import { readSeen as read, shouldPrompt, writeSeen as write, ROUTE_PROMPT_SESSION_KEY as SESSION_KEY } from "@/lib/route-prompt";
import { Orb } from "../orb";
import s from "./route-prompt.module.css";

/** Momentos en que sale (decisión de lectura del 0.13; se cambia aquí). */
export const ROUTE_PROMPT_WHEN = { afterCreate: true, onOpenExam: true } as const;
export { ROUTE_PROMPT_TITLE };
export function RoutePrompt({ exam, moment }: { exam: DreamExam; moment: keyof typeof ROUTE_PROMPT_WHEN }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!ROUTE_PROMPT_WHEN[moment]) return;
    let session = false;
    try {
      session = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      return;
    }
    const seen = read();
    // Un momento para que la pantalla se pinte y no chocar con otro diálogo.
    const t = window.setTimeout(() => {
      if (document.querySelector("[role='dialog']")) return;
      if (!shouldPrompt(exam, seen, Date.now(), { flags: studyStepsEnabled() && aiRouteEnabled(), sessionShown: session })) return;
      const prev = seen?.[exam.id];
      write({ ...seen, [exam.id]: { n: (prev?.n ?? 0) + 1, at: Date.now(), off: prev?.off } });
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* nada */
      }
      setOpen(true);
    }, 600);
    return () => window.clearTimeout(t);
  }, [exam, moment]);
  if (!open) return null;
  const dismiss = () => {
    const seen = read() ?? {};
    const prev = seen[exam.id] ?? { n: 1, at: Date.now() };
    write({ ...seen, [exam.id]: { ...prev, off: Date.now() } });
    setOpen(false);
  };
  return (
    <Modal labelledBy="ruta-popup-titulo" describedBy="ruta-popup-texto" onClose={dismiss} className={s.popup}>
      <div data-testid="ruta-popup">
        <button type="button" className={`${s.close} press`} aria-label="Cerrar" onClick={dismiss}>
          <X size={20} aria-hidden="true" />
        </button>
        <span className={s.orb} aria-hidden="true">
          <Orb size={64} breathing />
        </span>
        <h2 id="ruta-popup-titulo" className={s.title}>
          {ROUTE_PROMPT_TITLE}
        </h2>
        <p id="ruta-popup-texto" className={s.text}>
          Dream ordena tus apuntes y tu fecha de examen en lecciones cortas.
        </p>
        <div className={s.actions}>
          <button
            type="button"
            className="primary press"
            autoFocus
            onClick={() => {
              setOpen(false);
              router.push(`/exams/${exam.id}/ruta?crear=1`);
            }}
          >
            Crear mi ruta de estudio
          </button>
          <button type="button" className={`${s.later} press`} onClick={dismiss}>
            Ahora no
          </button>
        </div>
      </div>
    </Modal>
  );
}
