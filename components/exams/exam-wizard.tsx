"use client";
// Asistente de crear examen a pantalla completa (PROMPT_EXAMEN_ESTILO.md §5).
// Una pregunta por pantalla: bienvenida → apuntes (y aviso de pocos
// apuntes) → fecha → nota con la ruedecita → la IA pone nombre, asignatura y
// temas → «Tu examen está listo». El Shell no pinta menú en /exams/new
// (lib/navigation.ts › isFocusRoute). El paso va en la URL (?id=…&paso=…):
// Atrás del navegador vuelve al paso anterior y recargar retoma donde iba;
// el borrador guarda además el paso (wizard_step) para abrirlo desde el
// historial. Los pasos entran con page-enter-* (globals.css › Asistente).
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CloudOff, RotateCcw } from "lucide-react";
import { callDream, errorMessage } from "@/lib/dream-api";
import { getExam, updateExam, type DreamExam } from "@/lib/exam-plans";
import {
  GRADE,
  WIZARD_STEPS,
  dateError,
  formatGrade,
  gradeWarmth,
  isWizardStep,
  resumeStep,
  shouldWarnFewNotes,
  stepDirection,
  stepIndex,
  type NotesAnalysis,
  type WizardStep,
} from "@/lib/exam-wizard";
import { useMediaQuery } from "@/lib/use-media-query";
import { useOnline } from "@/lib/use-online";
import { AnimatedNumber } from "../animated-number";
import { BottomSheet } from "../bottom-sheet";
import { Orb } from "../orb";
import { DatePicker } from "./wizard/date-picker";
import { GradeWheel } from "./wizard/grade-wheel";
import { StepIdentify, useIdentity } from "./wizard/step-identify";
import { StepReady, startHref } from "./wizard/step-ready";
import { RoutePrompt } from "./route-prompt";
import { StepUpload } from "./wizard/step-upload";
import { useUploads } from "./wizard/use-uploads";
import s from "./wizard/wizard.module.css";

const DESKTOP = "(min-width: 900px) and (pointer: fine)";
const ANALYSIS_MIN_MS = 1400;
const PHRASES = [
  "Busco los temas que entran…",
  "Miro cuánto material hay…",
  "Ordeno las ideas principales…",
];
type Tone = "blue" | "warm" | "yellow";

function Continue({
  children = "Continuar",
  onClick,
  disabled,
  busy,
  tone = "yellow",
}: {
  children?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: "yellow" | "blue";
}) {
  return (
    <button
      type="button"
      className={`button-3d tone-${tone} press`}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      <span className="button-3d-face">
        {busy ? <Orb size={22} pulsing /> : null}
        {children}
        {!busy && <ArrowRight size={20} strokeWidth={2.5} aria-hidden="true" />}
      </span>
    </button>
  );
}

function StepTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className={`hero-title ${s.stepTitle}`} tabIndex={-1} data-step-title>
      {children}
    </h1>
  );
}

export function ExamWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const idParam = params.get("id");
  const pasoParam = params.get("paso");
  const desktop = useMediaQuery(DESKTOP);
  const online = useOnline();
  const [exam, setExam] = useState<DreamExam | null>(null);
  const [loading, setLoading] = useState(!!idParam);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [done, setDone] = useState<DreamExam | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [analysing, setAnalysing] = useState(false);
  const [phrase, setPhrase] = useState(0);
  const [fewSheet, setFewSheet] = useState(false);
  const [exitSheet, setExitSheet] = useState(false);
  const [date, setDate] = useState("");
  const [dateTouched, setDateTouched] = useState(false);
  const [grade, setGrade] = useState<number>(GRADE.initial);
  // «Continúa con tu examen de…» only on the first screen of a resumed draft.
  const [resumed, setResumed] = useState(!!idParam);
  const lock = useRef(false);
  const uploads = useUploads(exam, setExam);

  // Load (or reload) the draft named in the URL.
  useEffect(() => {
    if (!idParam) {
      setLoading(false);
      return;
    }
    if (exam?.id === idParam || done) return;
    const abort = new AbortController();
    setLoading(true);
    setLoadError("");
    getExam(idParam, abort.signal)
      .then((e) => {
        if (abort.signal.aborted) return;
        // A plan that exists (or is being made) opens its page, as before.
        if (e.status === "ready" || e.status === "completed" || e.status === "preparing") {
          router.replace(`/exams/${e.id}`);
          return;
        }
        setExam(e);
        setDate(e.exam_date || "");
        if (typeof e.target_grade === "number") setGrade(e.target_grade);
        setLoading(false);
      })
      .catch((e) => {
        if (abort.signal.aborted) return;
        setLoadError(errorMessage(e));
        setLoading(false);
      });
    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on id or retry
  }, [idParam, reload]);

  const step: WizardStep = done
    ? "listo"
    : !idParam
      ? "inicio"
      : exam
        ? resumeStep(exam, isWizardStep(pasoParam) ? pasoParam : null)
        : "apuntes";
  const [view, setView] = useState({ step, enter: "fade" as "forward" | "back" | "fade" });
  if (view.step !== step) setView({ step, enter: stepDirection(view.step, step) ?? "fade" });

  // Focus goes to the new step's title (and the live region reads «Paso N»).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setError("");
    setResumed(false);
    document.querySelector<HTMLElement>("[data-step-title]")?.focus({ preventScroll: true });
    document.querySelector(".workspace-main")?.scrollTo({ top: 0 });
  }, [step]);

  // The phrase under «Estoy leyendo tus apuntes…» changes softly.
  useEffect(() => {
    if (!analysing) return;
    setPhrase(0);
    const id = window.setInterval(() => setPhrase((n) => (n + 1) % PHRASES.length), 1400);
    return () => window.clearInterval(id);
  }, [analysing]);

  const go = useCallback(
    (next: WizardStep, id = exam?.id) => {
      if (id) router.push(`/exams/new?id=${id}&paso=${next}`, { scroll: false });
    },
    [exam?.id, router],
  );

  /** One async action at a time (double clicks do nothing). */
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const save = async (payload: Record<string, unknown>) => {
    const updated = await updateExam("exam_draft_update", exam!.id, payload);
    setExam(updated);
    return updated;
  };

  const start = () =>
    run(async () => {
      const id = crypto.randomUUID();
      const created = await updateExam("exam_create", id, { wizard: true });
      setExam(created);
      router.replace(`/exams/new?id=${created.id}&paso=apuntes`, { scroll: false });
    });

  const toDate = (ack = false) =>
    run(async () => {
      await save({ wizard_step: "date", ...(ack ? { few_notes_ack: true } : {}) });
      setFewSheet(false);
      go("fecha");
    });

  const analyse = () =>
    run(async () => {
      setAnalysing(true);
      try {
        const begin = Date.now();
        const { analysis } = await callDream<{ analysis: NotesAnalysis }>("exam_analyze", {
          exam_id: exam!.id,
        });
        await new Promise((ok) => setTimeout(ok, Math.max(0, ANALYSIS_MIN_MS - (Date.now() - begin))));
        if (shouldWarnFewNotes(analysis, !!exam!.few_notes_ack)) {
          setFewSheet(true);
          return;
        }
        await save({ wizard_step: "date" });
        go("fecha");
      } finally {
        setAnalysing(false);
      }
    });

  const toGrade = () => {
    const problem = dateError(date);
    setDateTouched(true);
    if (problem) return;
    void run(async () => {
      await save({ exam_date: date, wizard_step: "grade" });
      go("nota");
    });
  };
  const toIdentify = () =>
    run(async () => {
      await save({ target_grade: grade, wizard_step: "identify" });
      go("examen");
    });

  function exit() {
    if (!exam) return router.push("/exams");
    const empty = !exam.materials.length && !uploads.rows.length;
    if (empty && step === "apuntes") {
      // Nothing to keep: the empty draft goes away quietly.
      void callDream("exam_delete", { exam_id: exam.id }).catch(() => {});
      return router.push("/exams");
    }
    setExitSheet(true);
  }

  const tone: Tone = step === "nota" ? "warm" : step === "listo" ? "yellow" : "blue";
  const index = stepIndex(step);
  const total = WIZARD_STEPS.length;
  const progress = step === "listo" ? 1 : index / total;
  const stepLabel = step === "listo" ? "Listo" : WIZARD_STEPS[index]?.label;

  let content: ReactNode;
  let footer: ReactNode = null;
  if (loading)
    content = (
      <div className={s.analysing} aria-busy="true">
        <Orb size={80} pulsing />
        <p className={s.lead} role="status">
          Abriendo tu examen…
        </p>
      </div>
    );
  else if (loadError)
    content = (
      <div className={s.analysing}>
        <Orb size={80} reaction="error" />
        <h1 className={`hero-title ${s.stepTitle}`}>No he podido abrir tu examen</h1>
        <p className={s.lead} role="alert">
          {loadError}
        </p>
        <button type="button" className="secondary press" onClick={() => setReload((n) => n + 1)}>
          <RotateCcw size={18} aria-hidden="true" /> Reintentar
        </button>
      </div>
    );
  else if (step === "inicio") {
    content = (
      <div className={`${s.welcome} stagger`}>
        <span className={s.welcomeOrb}>
          <Orb size={120} breathing />
        </span>
        <StepTitle>
          Vamos a preparar tu <span className="marker marker-draw">examen</span>
        </StepTitle>
        <p className={s.lead}>Sube tus apuntes y yo hago el resto.</p>
      </div>
    );
    footer = (
      <Continue onClick={() => void start()} busy={busy} disabled={!online}>
        Empezar
      </Continue>
    );
  } else if (step === "apuntes" && exam) {
    content = analysing ? (
      <div className={s.analysing}>
        <Orb size={96} pulsing />
        <p className={s.lead} role="status">
          Estoy leyendo tus apuntes…
        </p>
        <p className={s.phrase} key={phrase} aria-hidden="true">
          {PHRASES[phrase]}
        </p>
      </div>
    ) : (
      <>
        <StepTitle>
          Primero, sube tus <span className="marker">apuntes</span>
        </StepTitle>
        <StepUpload examId={exam.id} desktop={desktop} uploads={uploads} disabled={!online} />
      </>
    );
    footer = !analysing && (
      <>
        {uploads.busy && (
          <p className={s.footerNote} role="status">
            Espera a que terminen de subir tus apuntes.
          </p>
        )}
        <Continue
          onClick={() => void analyse()}
          busy={busy}
          disabled={!online || uploads.busy || uploads.ready === 0}
        />
        {uploads.ready === 0 && !uploads.busy && (
          <p className={s.footerNote}>Sube al menos un archivo para seguir.</p>
        )}
      </>
    );
  } else if (step === "fecha" && exam) {
    const problem = dateTouched ? dateError(date) : null;
    content = (
      <>
        <StepTitle>
          ¿Cuándo es tu <span className="marker">examen</span>?
        </StepTitle>
        <DatePicker
          value={date}
          onChange={(d) => {
            setDate(d);
            setDateTouched(false);
          }}
        />
        {problem && (
          <p className={s.fieldError} role="alert">
            {problem}
          </p>
        )}
      </>
    );
    footer = <Continue onClick={toGrade} busy={busy} disabled={!online} />;
  } else if (step === "nota" && exam) {
    content = (
      <>
        <StepTitle>
          ¿Qué <span className="marker">nota</span> quieres sacar?
        </StepTitle>
        <div className={s.gradeLayout}>
          <p className={s.gradeBig} aria-hidden="true">
            <AnimatedNumber value={grade} format={formatGrade} label={`${formatGrade(grade)} sobre 10`} />
            <small>/ 10</small>
          </p>
          <GradeWheel value={grade} onChange={setGrade} labelledBy="grade-label" />
        </div>
        <p id="grade-label" className="visually-hidden">
          Nota que quieres sacar, de 0 a 10
        </p>
      </>
    );
    footer = <Continue onClick={() => void toIdentify()} busy={busy} disabled={!online} tone="blue" />;
  } else if (step === "examen" && exam) {
    content = <IdentifyStage exam={exam} setExam={setExam} online={online} onDone={setDone} />;
  } else if (step === "listo" && done) {
    content = (
      <>
        <StepTitle>
          Tu examen está <span className="marker marker-draw">listo</span>
        </StepTitle>
        <StepReady exam={done} />
        <RoutePrompt exam={done} moment="afterCreate" />
      </>
    );
    footer = (
      <Continue tone="blue" onClick={() => router.push(startHref(done))}>
        Empezar
      </Continue>
    );
  }

  return (
    <div
      className={s.frame}
      data-tone={tone}
      style={{ "--warmth": gradeWarmth(grade) } as CSSProperties}
    >
      <div className={s.bg} aria-hidden="true">
        <span className={s.bgBlue} />
        <span className={s.bgGrid} />
        <span className={s.bgWarm} />
        <span className={s.bgWarmHot} />
        <span className={s.bgYellow} />
      </div>
      <div className={s.top}>
        {step === "listo" ? (
          <span />
        ) : (
          <button
            type="button"
            className={`${s.backButton} press`}
            aria-label="Salir del asistente"
            onClick={exit}
          >
            <ArrowLeft size={22} aria-hidden="true" />
          </button>
        )}
        <span
          className={s.progress}
          role="progressbar"
          aria-label="Progreso del examen"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.min(total, index)}
        >
          <i style={{ transform: `scaleX(${Math.max(0.04, progress)})` }} />
        </span>
        <span className={s.count} aria-hidden="true">
          {step === "listo" ? "¡Hecho!" : `${index + 1} de ${total}`}
        </span>
      </div>
      <p className="visually-hidden" aria-live="polite">
        {loading || loadError
          ? ""
          : step === "listo"
            ? "Tu examen está listo"
            : `Paso ${index + 1} de ${total}: ${stepLabel}`}
      </p>
      <div className="wizard-step" key={loading ? "loading" : step} data-enter={view.enter}>
        <div className={`${s.body} ${step === "apuntes" && desktop ? s.bodyWide : ""}`}>
          {resumed && exam && !loading && (
            <span className={s.resume}>
              Continúa con tu examen{exam.subject.trim() ? ` de ${exam.subject}` : ""}
            </span>
          )}
          {!online && (
            <p className={s.offline} role="status">
              <CloudOff size={18} aria-hidden="true" />
              Sin conexión. Lo que ya has hecho está guardado; sigue cuando vuelva.
            </p>
          )}
          {content}
          {error && step !== "examen" && (
            <p className={s.fieldError} role="alert">
              {error}
            </p>
          )}
        </div>
        {footer && <div className={s.footer}>{footer}</div>}
      </div>

      {fewSheet && (
        <BottomSheet labelledBy="few-title" describedBy="few-text" onClose={() => setFewSheet(false)}>
          <div className={s.sheetOrb}>
            <Orb size={56} breathing />
          </div>
          <h2 id="few-title">Veo que son pocos apuntes</h2>
          <p id="few-text">
            ¿Tienes alguno más? Con más material puedo prepararte mejor el examen.
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary press"
              onClick={() => void toDate(true)}
              disabled={busy}
            >
              Continuar con estos
            </button>
            <button
              type="button"
              className="primary press"
              onClick={() => setFewSheet(false)}
              autoFocus
            >
              Subir más archivos
            </button>
          </div>
        </BottomSheet>
      )}
      {exitSheet && (
        <BottomSheet labelledBy="exit-title" describedBy="exit-text" onClose={() => setExitSheet(false)}>
          <h2 id="exit-title">¿Salir?</h2>
          <p id="exit-text">Tu examen se guarda como borrador. Puedes seguir desde Exámenes.</p>
          <div className="modal-actions">
            <button type="button" className="secondary press" onClick={() => router.push("/exams")}>
              Salir
            </button>
            <button
              type="button"
              className="primary press"
              onClick={() => setExitSheet(false)}
              autoFocus
            >
              Seguir con mi examen
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

/** Paso 5 with its own footer: «Crear mi ruta» saves and runs exam_prepare. */
function IdentifyStage({
  exam,
  setExam,
  online,
  onDone,
}: {
  exam: DreamExam;
  setExam: (e: DreamExam) => void;
  online: boolean;
  onDone: (e: DreamExam) => void;
}) {
  const state = useIdentity(exam, setExam);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const { identity, phase } = state;
  async function create() {
    if (lock.current) return;
    const title = identity.title.replace(/\s+/g, " ").trim();
    if (title.length < 3) return setError("Escribe un nombre para tu examen (3 letras o más).");
    if (!identity.subject.trim()) return setError("Elige la asignatura.");
    lock.current = true;
    setCreating(true);
    setError("");
    try {
      await updateExam("exam_draft_update", exam.id, {
        title,
        subject: identity.subject,
        topics: identity.topics,
      });
      const ready = await updateExam("exam_prepare", exam.id);
      setExam(ready);
      onDone(ready);
    } catch (e) {
      setError(`${errorMessage(e)} Tus apuntes y datos siguen guardados.`);
    } finally {
      lock.current = false;
      setCreating(false);
    }
  }
  return (
    <>
      <StepTitle>
        Tu <span className="marker">examen</span>
      </StepTitle>
      <StepIdentify state={state} error={error} />
      {phase !== "loading" && (
        <div className={s.footer}>
          {creating && (
            <p className={s.footerNote} role="status">
              Estoy creando tu ruta. Puede tardar un poco…
            </p>
          )}
          <Continue onClick={() => void create()} busy={creating} disabled={!online}>
            Crear mi ruta
          </Continue>
        </div>
      )}
    </>
  );
}
