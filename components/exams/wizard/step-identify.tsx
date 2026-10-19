"use client";
// Paso 5: la IA identifica el examen (§5.7). «Preparando tu examen…» con el
// orbe; luego aparece la asignatura en grande con su objeto (pequeño rebote),
// el nombre (con «Cambiar») y los temas como etiquetas que se quitan o se
// añaden. «No es esta asignatura» abre una hoja con la lista. Si la IA falla
// o se agota el uso, mensaje amable y nombre y asignatura a mano.
import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, RotateCcw, X } from "lucide-react";
import { callDream, DreamApiError } from "@/lib/dream-api";
import type { DreamExam } from "@/lib/exam-plans";
import { KNOWN_SUBJECTS } from "@/lib/subject-objects";
import { BottomSheet } from "../../bottom-sheet";
import { Orb } from "../../orb";
import { SubjectObject } from "../../subject-object";
import s from "./wizard.module.css";

export interface Identity {
  title: string;
  subject: string;
  topics: string[];
}
type Phase = "loading" | "ready" | "manual";

/** Minimum time on «Preparando tu examen…» so the reveal reads as one. */
const MIN_LOADING_MS = 900;

export function useIdentity(exam: DreamExam, setExam: (e: DreamExam) => void) {
  const known = exam.title.trim() && exam.subject.trim();
  const [phase, setPhase] = useState<Phase>(known ? "ready" : "loading");
  const [identity, setIdentity] = useState<Identity>({
    title: exam.title,
    subject: exam.subject,
    topics: exam.topics,
  });
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (phase !== "loading") return;
    const abort = new AbortController();
    const begin = Date.now();
    callDream<{ exam: DreamExam; identity: Identity }>(
      "exam_identify",
      { exam_id: exam.id },
      abort.signal,
    )
      .then(async (r) => {
        await new Promise((ok) => setTimeout(ok, Math.max(0, MIN_LOADING_MS - (Date.now() - begin))));
        if (abort.signal.aborted) return;
        setExam(r.exam);
        setIdentity(r.identity);
        setPhase("ready");
      })
      .catch((e) => {
        if (abort.signal.aborted) return;
        const limited = e instanceof DreamApiError && e.status === 429;
        setNotice(
          limited
            ? "Ahora mismo no puedo leer tus apuntes: has usado mucho la IA en poco tiempo. Escribe tú el nombre y la asignatura, o vuelve a intentarlo más tarde."
            : "Ahora no he podido leer tus apuntes. Vuelve a intentarlo o escribe tú el nombre y la asignatura.",
        );
        setPhase("manual");
      });
    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per attempt
  }, [attempt, phase]);
  return {
    phase,
    /** The AI (or the saved draft) gave a name: show it with «Cambiar». */
    identityTitleKnown: phase === "ready",
    identity,
    setIdentity,
    notice,
    retry: () => {
      setNotice("");
      setPhase("loading");
      setAttempt((n) => n + 1);
    },
  };
}

export function StepIdentify({
  state,
  error,
}: {
  state: ReturnType<typeof useIdentity>;
  error: string;
}) {
  const { phase, identity, setIdentity, notice, retry } = state;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(identity.title);
  const [topic, setTopic] = useState("");
  const [sheet, setSheet] = useState(false);

  if (phase === "loading")
    return (
      <div className={s.analysing} aria-busy="true">
        <Orb size={96} pulsing breathing />
        <p className={s.lead} role="status">
          Preparando tu examen…
        </p>
      </div>
    );

  const manual = phase === "manual";
  const subject = identity.subject.trim();
  function addTopic(e: FormEvent) {
    e.preventDefault();
    const t = topic.replace(/\s+/g, " ").trim().slice(0, 80);
    if (t && !identity.topics.some((x) => x.toLowerCase() === t.toLowerCase()) && identity.topics.length < 12)
      setIdentity({ ...identity, topics: [...identity.topics, t] });
    setTopic("");
  }
  return (
    <div className={s.reveal}>
      {manual && (
        <div className={s.notice} role="alert">
          <p>{notice}</p>
          <div className={s.noticeActions}>
            <button type="button" className="secondary press" onClick={retry}>
              <RotateCcw size={18} aria-hidden="true" /> Volver a intentarlo
            </button>
          </div>
        </div>
      )}
      <div className={s.subjectRow}>
        <h2 className="hero-title">{subject || "¿De qué asignatura es?"}</h2>
        {subject && (
          <SubjectObject subject={subject} size={112} className={s.objectIn} key={subject} />
        )}
      </div>
      <button type="button" className={`${s.linkButton} press`} onClick={() => setSheet(true)}>
        {subject ? "No es esta asignatura" : "Elegir asignatura"}
      </button>

      <section className={s.panel} aria-labelledby="exam-name-label">
        <span className={s.label} id="exam-name-label">
          Nombre del examen
        </span>
        {editing || manual || !state.identityTitleKnown ? (
          <form
            className={s.inlineForm}
            onSubmit={(e) => {
              e.preventDefault();
              const t = name.replace(/\s+/g, " ").trim();
              if (t.length < 3) return;
              setIdentity({ ...identity, title: t.slice(0, 160) });
              setEditing(false);
            }}
          >
            <input
              aria-labelledby="exam-name-label"
              value={editing ? name : identity.title}
              maxLength={160}
              autoFocus={editing}
              placeholder="Por ejemplo, Ecuaciones de segundo grado"
              onChange={(e) =>
                editing
                  ? setName(e.target.value)
                  : setIdentity({ ...identity, title: e.target.value })
              }
            />
            {editing && (
              <button className="secondary press" type="submit">
                Guardar
              </button>
            )}
          </form>
        ) : (
          <div className={s.nameRow}>
            <h3>{identity.title}</h3>
            <button
              type="button"
              className="secondary press"
              onClick={() => {
                setName(identity.title);
                setEditing(true);
              }}
            >
              <Pencil size={16} aria-hidden="true" /> Cambiar
            </button>
          </div>
        )}

        <span className={s.label} id="exam-topics-label">
          Temas
        </span>
        {identity.topics.length > 0 ? (
          <ul className={s.chips} aria-labelledby="exam-topics-label">
            {identity.topics.map((t) => (
              <li key={t} className={`${s.chip} pop-in`}>
                {t}
                <button
                  type="button"
                  aria-label={`Quitar el tema ${t}`}
                  onClick={() =>
                    setIdentity({ ...identity, topics: identity.topics.filter((x) => x !== t) })
                  }
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.label}>Sin temas: Dream los sacará de tus apuntes.</p>
        )}
        <form className={s.inlineForm} onSubmit={addTopic}>
          <input
            aria-label="Añadir un tema"
            placeholder="Añadir un tema"
            value={topic}
            maxLength={80}
            onChange={(e) => setTopic(e.target.value)}
          />
          <button className="secondary press" type="submit" disabled={!topic.trim()}>
            <Plus size={16} aria-hidden="true" /> Añadir
          </button>
        </form>
      </section>
      {error && (
        <p className={s.fieldError} role="alert">
          {error}
        </p>
      )}
      {sheet && (
        <BottomSheet labelledBy="subject-sheet-title" onClose={() => setSheet(false)}>
          <h2 id="subject-sheet-title">¿De qué asignatura es?</h2>
          <ul className={s.subjects}>
            {KNOWN_SUBJECTS.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  className={`${s.subjectOption} press`}
                  aria-pressed={name === subject}
                  onClick={() => {
                    setIdentity({ ...identity, subject: name });
                    setSheet(false);
                  }}
                >
                  <SubjectObject subject={name} size={36} float={false} />
                  {name}
                </button>
              </li>
            ))}
          </ul>
          <div className="modal-actions">
            <button type="button" className="secondary press" onClick={() => setSheet(false)}>
              Cancelar
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
