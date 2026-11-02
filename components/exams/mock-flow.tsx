"use client";
// Simulacro de la ruta (prompt de la ruta, 0.7 y Bloque 5; Claude Design
// PantallaSimulacroMovil/Escritorio): pantalla previa con una sola acción,
// preguntas a pantalla completa con el reloj del servidor, entrega, y
// resultados con la nota estimada frente al objetivo. El detalle (fallos,
// solución muy detallada, «No estoy de acuerdo») va en hojas. Sin pistas ni
// corrección hasta entregar.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X as XIcon } from "lucide-react";
import { callDream, errorMessage } from "@/lib/dream-api";
import {
  cardsImport,
  mockCause,
  mockCreate,
  mockDispute,
  mockGet,
  mockPreview,
  mockSave,
  mockSubmit,
  type Blueprint,
  type MockKind,
  type MockPlan,
  type MockQuestion,
  type MockReviewItem,
  type MockSession,
} from "@/lib/study-api";
import { BottomSheet } from "../bottom-sheet";
import { DreamActivity } from "../dream-mark";
import { Markdown } from "../markdown";
import { Modal } from "../modal";
import { PlayWhileWaiting } from "../games/play-while-waiting";
import { StepFrame } from "./step-frame";
import sf from "./step-frame.module.css";
import l from "./lesson-flow.module.css";
import s from "./mock-flow.module.css";

const CAUSES: [string, string][] = [
  ["concepto", "Concepto que no sabías"],
  ["despiste", "Despiste"],
  ["tiempo", "Falta de tiempo"],
  ["expresion", "Expresión o redacción"],
  ["enunciado", "No entendiste la pregunta"],
];
const TITLE: Record<MockKind, string> = { diagnostic: "Tu punto de partida", block: "Simulacro de bloque", final: "Tu simulacro final" };
const grade = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function mixText(p: MockPlan) {
  const parts = [
    p.mix.mcq ? `${p.mix.mcq} tipo test` : "",
    p.mix.tf ? `${p.mix.tf} verdadero/falso` : "",
    p.mix.written ? `${p.mix.written} de escribir` : "",
  ].filter(Boolean);
  return parts.join(", ");
}

type Phase =
  | { kind: "preview" }
  | { kind: "preparing" }
  | { kind: "doing" }
  | { kind: "grading"; failed?: string }
  | { kind: "results" }
  | { kind: "error"; message: string };

export function MockFlow({ examId, kind, sessionId: initialSession }: { examId: string; kind: MockKind; sessionId: string | null }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: initialSession ? "preparing" : "preview" });
  const [plan, setPlan] = useState<MockPlan | null>(null);
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [quota, setQuota] = useState<{ ok: boolean; cap: number } | null>(null);
  const [timed, setTimed] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(initialSession);
  const [session, setSession] = useState<MockSession | null>(null);
  const [questions, setQuestions] = useState<MockQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [review, setReview] = useState<MockReviewItem[]>([]);
  const [target, setTarget] = useState<number | null>(null);
  const [startPoint, setStartPoint] = useState<{ known: string[]; start: string[] } | null>(null);
  const [sheet, setSheet] = useState<"list" | "fails" | "probable" | null>(null);
  // Los fallos que se enseñan no cambian mientras la hoja está abierta (aunque una discusión suba la nota).
  const [failIds, setFailIds] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [announce, setAnnounce] = useState("");
  const revision = useRef(0);
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const submitted = useRef(false);
  const deadline = useRef<number | null>(null);

  // ── Pantalla previa ──
  useEffect(() => {
    if (initialSession) return;
    mockPreview(examId, kind)
      .then((r) => {
        setPlan(r.plan);
        setBlueprint(r.blueprint);
        setQuota(r.quota);
        setTarget(r.target_grade);
      })
      .catch((e) => setPhase({ kind: "error", message: errorMessage(e) }));
  }, [examId, kind, initialSession]);

  const load = useCallback(
    async (sid: string) => {
      const r = await mockGet(examId, sid);
      setSession(r.session);
      revision.current = r.session.revision;
      if ("review" in r) {
        setReview(r.review);
        setTarget(r.target_grade);
        setStartPoint(r.starting_point);
        setPhase({ kind: "results" });
        return;
      }
      setQuestions(r.questions);
      setAnswers(r.session.answers ?? {});
      setIndex(Math.min(r.session.question_index, Math.max(0, r.questions.length - 1)));
      if (r.session.remaining_seconds !== null) deadline.current = Date.now() + r.session.remaining_seconds * 1000;
      setRemaining(r.session.remaining_seconds);
      // Entregado pero sin corregir (se cortó la corrección): se reintenta al volver.
      if (r.session.status === "grading") return void submit(sid);
      if (r.session.status === "active" && r.session.remaining_seconds === 0) return void submit(sid);
      // Se recargó mientras se preparaba: se vuelve a mirar en unos segundos.
      if (r.session.status === "generating") {
        setPhase({ kind: "preparing" });
        window.setTimeout(() => void load(sid).catch(() => undefined), 4000);
        return;
      }
      setPhase(r.session.status === "active" ? { kind: "doing" } : { kind: "error", message: "Este simulacro no se pudo preparar." });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [examId],
  );
  // Recuperación al recargar o volver: ?s=<sesión>.
  useEffect(() => {
    if (initialSession) load(initialSession).catch((e) => setPhase({ kind: "error", message: errorMessage(e) }));
  }, [initialSession, load]);

  async function start() {
    const sid = sessionId ?? crypto.randomUUID();
    setSessionId(sid);
    // La sesión va en la dirección para recuperarla al recargar (sin volver a montar la página).
    window.history.replaceState(null, "", `/exams/${examId}/simulacro?tipo=${kind === "final" ? "final" : kind === "block" ? "bloque" : "diagnostico"}&s=${sid}`);
    setPhase({ kind: "preparing" });
    try {
      await mockCreate(examId, sid, kind, kind === "final" || (kind === "block" && timed));
      await load(sid);
    } catch (e) {
      setPhase({ kind: "error", message: errorMessage(e) });
    }
  }

  // ── Reloj del servidor: avisos a 5 y a 1 minuto; al acabar se entrega lo contestado ──
  useEffect(() => {
    if (phase.kind !== "doing" || deadline.current === null) return;
    const tick = () => {
      const left = Math.max(0, Math.round((deadline.current! - Date.now()) / 1000));
      setRemaining(left);
      if (left === 300) setAnnounce("Quedan 5 minutos.");
      if (left === 60) setAnnounce("Queda 1 minuto.");
      if (left === 0 && sessionId) void submit(sessionId);
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind, sessionId]);

  function save(next: Record<string, string>, at: number) {
    if (!sessionId) return;
    // En orden: cada guardado espera al anterior (la revisión evita pisar otra pestaña).
    saving.current = saving.current
      .then(() => mockSave(examId, sessionId, next, at, revision.current))
      .then((r) => {
        revision.current = r.session.revision;
        setSaveError("");
      })
      .catch((e) => setSaveError(errorMessage(e)));
  }
  function answer(q: MockQuestion, value: string) {
    const next = { ...answers, [q.id]: value };
    setAnswers(next);
    if (q.type !== "written") save(next, index);
  }
  function go(to: number) {
    const q = questions[index];
    if (q?.type === "written") save(answers, to);
    else save(answers, to);
    setIndex(to);
  }
  async function submit(sid: string) {
    if (submitted.current) return;
    submitted.current = true;
    setConfirm(false);
    setPhase({ kind: "grading" });
    try {
      await saving.current;
      await mockSubmit(examId, sid);
      await load(sid);
    } catch (e) {
      submitted.current = false;
      setPhase({ kind: "grading", failed: errorMessage(e) });
    }
  }

  const back = `/exams/${examId}/ruta`;

  if (phase.kind === "error")
    return (
      <div className={sf.frame}>
        <main className={l.notice}>
          <h1 className={sf.prompt}>No hemos podido preparar el simulacro</h1>
          <p>{phase.message}</p>
        </main>
        <footer className={sf.foot}>
          <Link className="primary press" href={back}>
            Volver a la ruta
          </Link>
        </footer>
      </div>
    );

  // ── Pantalla previa (0.7): «Tu simulacro final: 15 preguntas · 50 min · …» y «Empezar» ──
  if (phase.kind === "preview") {
    if (!plan)
      return (
        <div className={sf.frame} aria-busy="true">
          <p className="visually-hidden" role="status">
            Cargando
          </p>
        </div>
      );
    const minutes = kind === "final" || (kind === "block" && timed) ? plan.minutes : null;
    const general = kind === "final" && blueprint && !blueprint.enough_material;
    return (
      <div className={sf.frame} data-testid="simulacro-previa">
        <header className={sf.top}>
          <Link className={`${sf.close} press`} href={back} aria-label="Volver a la ruta">
            <XIcon size={20} aria-hidden="true" />
          </Link>
        </header>
        <main className={s.preview}>
          <h1 className={s.title}>{TITLE[kind]}</h1>
          <p className={s.line}>
            <span className="num">{plan.count}</span> preguntas{minutes ? <> · <span className="num">{minutes}</span> min</> : kind === "diagnostic" ? " · sin nota y sin reloj" : " · sin reloj"}
          </p>
          <p className={s.sub}>{mixText(plan)}</p>
          {kind === "final" && blueprint?.enough_material && (
            <p className={s.sub}>
              Basado en {blueprint.based_on}.{" "}
              <button type="button" className={s.link} onClick={() => setSheet("probable")}>
                Preguntas probables
              </button>
            </p>
          )}
          {general && <p className={s.sub}>Con tan pocos apuntes no puedo estimar qué preguntará tu profe: te propongo un simulacro general.</p>}
          {kind === "final" && <p className={s.small}>Las de escribir puntúan por ideas clave. Sin pistas ni corrección hasta que entregues.</p>}
          {kind === "block" && (
            <div className={s.toggle} role="radiogroup" aria-label="Reloj">
              <button type="button" role="radio" aria-checked={timed} className={`press ${s.seg}`} data-on={timed || undefined} onClick={() => setTimed(true)}>
                Con tiempo
              </button>
              <button type="button" role="radio" aria-checked={!timed} className={`press ${s.seg}`} data-on={!timed || undefined} onClick={() => setTimed(false)}>
                Sin tiempo
              </button>
            </div>
          )}
          {quota && !quota.ok && <p className={s.sub} role="status">Hoy ya has hecho {quota.cap} simulacros. Mañana tienes más; mientras, repasa tus fallos.</p>}
        </main>
        <footer className={sf.foot}>
          <button className="primary press" disabled={!!quota && !quota.ok} onClick={() => void start()}>
            Empezar
          </button>
        </footer>
        {sheet === "probable" && blueprint && (
          <BottomSheet labelledBy="probables" onClose={() => setSheet(null)}>
            <h2 id="probables">Preguntas que probablemente pondrá tu profe</h2>
            <p className={s.small}>Estimación de Dream según tus apuntes y tus exámenes anteriores. No es seguro que caigan.</p>
            <ul className={s.list}>
              {blueprint.candidates.map((c, i) => (
                <li key={i}>
                  <strong>{c.hint}</strong>
                  <span>{c.reason}</span>
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button className="secondary press" onClick={() => setSheet(null)}>
                Cerrar
              </button>
            </div>
          </BottomSheet>
        )}
      </div>
    );
  }

  // ── Preparando y corrigiendo: la Orb (y el juego opcional si tarda) ──
  if (phase.kind === "preparing" || phase.kind === "grading")
    return (
      <div className={`${sf.frame} ${l.dark}`} data-testid="simulacro-espera">
        <header className={sf.top}>
          <Link className={`${sf.close} press`} href={back} aria-label="Volver a la ruta">
            <XIcon size={20} aria-hidden="true" />
          </Link>
        </header>
        <main className={l.prep}>
          {phase.kind === "grading" && phase.failed ? (
            <>
              <h1 className={l.prepTitle}>No hemos podido corregir ahora</h1>
              <p className={l.prepSub}>{phase.failed} Tus respuestas están guardadas.</p>
              <button className="primary press" onClick={() => sessionId && void submit(sessionId)}>
                Reintentar
              </button>
            </>
          ) : (
            <>
              <DreamActivity state="thinking" label={phase.kind === "grading" ? "Corrigiendo" : "Preparando tu simulacro"} />
              <h1 className={l.prepTitle}>{phase.kind === "grading" ? "Corrigiendo tu simulacro…" : "Preparando tu simulacro…"}</h1>
              <p className={l.prepSub}>{phase.kind === "grading" ? "Las de escribir, criterio a criterio." : "Con tus apuntes y lo que has estudiado."}</p>
              <PlayWhileWaiting expectedMs={20000} ready={false} readyText="Tu simulacro está listo" startText="Empezar" onStart={() => undefined} />
            </>
          )}
        </main>
      </div>
    );

  // ── Resultados (5.4) ──
  if (phase.kind === "results" && session) {
    const fails = review.filter((r) => !r.annulled && r.score < 0.5);
    if (session.kind === "diagnostic")
      return (
        <div className={sf.frame} data-testid="simulacro-resultados">
          <main className={s.results}>
            <h1 className={s.title}>Tu punto de partida</h1>
            {startPoint?.known.length ? (
              <p className={s.sub}>
                <strong>Ya sabes:</strong> {startPoint.known.join(", ")}.
              </p>
            ) : (
              <p className={s.sub}>Aún no hay ningún tema que domines: empezamos desde la base.</p>
            )}
            {!!startPoint?.start.length && (
              <p className={s.sub}>
                <strong>Empieza por:</strong> {startPoint.start.join(", ")}.
              </p>
            )}
          </main>
          <footer className={sf.foot}>
            <button
              className="primary press"
              onClick={() => {
                // El resultado pasa a la ruta con IA como dato (1 al día; si ya se hizo hoy, no pasa nada).
                void callDream("exam_route_regenerate", { exam_id: examId, trigger: "result" }).catch(() => undefined);
                router.push(back);
              }}
            >
              Ir a mi ruta
            </button>
          </footer>
        </div>
      );
    const g = Number(session.estimated_grade ?? 0);
    const pct = g * 10;
    return (
      <div className={sf.frame} data-testid="simulacro-resultados">
        <main className={s.results}>
          <p className={s.eyebrow}>Nota estimada por Dream</p>
          <p className={s.grade}>
            <span className="num">{grade(g)}</span>
          </p>
          {target !== null && (
            <p className={s.sub}>
              Vas a un <span className="num">{grade(g)}</span>. Tu objetivo es <span className="num">{target.toLocaleString("es-ES")}</span>.
            </p>
          )}
          <p className={s.sub}>
            {fails.length === 0
              ? "Sin fallos. Así se llega al examen."
              : pct >= 80
                ? `Muy cerca: ${fails.length} ${fails.length === 1 ? "fallo" : "fallos"} que repasar.`
                : pct >= 60
                  ? "Vas por buen camino. Repasa tus fallos y repite uno parecido en unos dos días."
                  : "Ahora sabes dónde estás. Tus fallos te dicen qué estudiar primero."}
          </p>
        </main>
        <footer className={sf.foot}>
          <button
            className={`secondary press ${sf.small}`}
            disabled={!fails.length}
            onClick={() => {
              setFailIds(fails.map((f) => f.id));
              setSheet("fails");
            }}
          >
            Ver mis fallos
          </button>
          <Link className="primary press" href={back}>
            Continuar
          </Link>
        </footer>
        {sheet === "fails" && (
          <FailsSheet
            examId={examId}
            sessionId={session.id}
            items={review.filter((r) => failIds.includes(r.id))}
            onChange={(id, patch) => setReview((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))}
            onGrade={(n) => setSession({ ...session, estimated_grade: n })}
            onClose={() => setSheet(null)}
          />
        )}
      </div>
    );
  }

  // ── Haciendo el simulacro (0.7): sin pistas ni corrección hasta entregar ──
  const q = questions[index];
  if (!q) return null;
  const last = index === questions.length - 1;
  const value = answers[q.id] ?? "";
  return (
    <>
      <StepFrame
        label="Simulacro"
        position={index + 1}
        total={questions.length}
        remaining={remaining}
        warning={remaining !== null && remaining <= 300}
        onCounter={() => setSheet("list")}
        onExit={() => {
          void saving.current.then(() => router.push(back));
        }}
        footer={
          <>
            <button className={`secondary press ${sf.small}`} disabled={index === 0} onClick={() => go(index - 1)} aria-label="Anterior">
              Anterior
            </button>
            {last ? (
              <button className="primary press" onClick={() => setConfirm(true)}>
                Entregar
              </button>
            ) : (
              <button className="primary press" onClick={() => go(index + 1)}>
                Siguiente
              </button>
            )}
          </>
        }
      >
        <section className={l.question} key={q.id}>
          {q.topic && <p className={sf.topic}>{q.topic}</p>}
          <h1 className={sf.prompt}>
            <Markdown content={q.prompt} />
          </h1>
          {q.type === "written" ? (
            <label className={l.written}>
              <span>Tu respuesta</span>
              <textarea
                value={value}
                maxLength={1500}
                rows={8}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                onBlur={() => save(answers, index)}
              />
              <small className="num">{value.length}/1500</small>
            </label>
          ) : (
            <div className={l.options} role="radiogroup" aria-label="Respuestas">
              {q.options.map((o) => (
                <button key={o} type="button" role="radio" aria-checked={value === o} className={`${l.option} press`} data-picked={value === o || undefined} onClick={() => answer(q, o)}>
                  {o}
                </button>
              ))}
            </div>
          )}
          {saveError && (
            <p className={sf.saveError} role="alert">
              {saveError}
            </p>
          )}
          <p className="visually-hidden" role="status" aria-live="assertive">
            {announce}
          </p>
        </section>
      </StepFrame>
      {sheet === "list" && (
        <BottomSheet labelledBy="preguntas-sim" onClose={() => setSheet(null)}>
          <h2 id="preguntas-sim">Preguntas</h2>
          <div className={s.grid}>
            {questions.map((x, i) => (
              <button
                key={x.id}
                type="button"
                className={`press ${s.cell}`}
                data-done={answers[x.id] ? true : undefined}
                aria-current={i === index ? "step" : undefined}
                aria-label={`Pregunta ${i + 1}${answers[x.id] ? ", contestada" : ""}`}
                onClick={() => {
                  setSheet(null);
                  go(i);
                }}
              >
                <span className="num">{i + 1}</span>
              </button>
            ))}
          </div>
          <div className="modal-actions">
            <button className="secondary press" onClick={() => setSheet(null)}>
              Cerrar
            </button>
          </div>
        </BottomSheet>
      )}
      {confirm && (
        <Modal labelledBy="entregar-sim" onClose={() => setConfirm(false)}>
          <h2 id="entregar-sim">¿Entregar el simulacro?</h2>
          <p>
            Has contestado <span className="num">{Object.values(answers).filter(Boolean).length}</span> de <span className="num">{questions.length}</span>. Después verás la corrección y las soluciones.
          </p>
          <div className="modal-actions">
            <button className="secondary press" onClick={() => setConfirm(false)}>
              Seguir
            </button>
            <button className="primary press" onClick={() => sessionId && void submit(sessionId)}>
              Entregar
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function FailsSheet({
  examId,
  sessionId,
  items,
  onChange,
  onGrade,
  onClose,
}: {
  examId: string;
  sessionId: string;
  items: MockReviewItem[];
  onChange: (id: string, patch: Partial<MockReviewItem>) => void;
  onGrade: (n: number) => void;
  onClose: () => void;
}) {
  const [arguing, setArguing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [cards, setCards] = useState<"idle" | "done">("idle");
  async function dispute(item: MockReviewItem) {
    setBusy(true);
    try {
      const r = await mockDispute(examId, sessionId, item.id, text);
      onChange(item.id, { dispute: { accepted: r.accepted, message: r.message }, disputes: item.disputes + 1, score: r.score, annulled: r.annulled });
      onGrade(r.estimated_grade);
      setArguing(null);
      setText("");
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function toCards() {
    setBusy(true);
    try {
      // «Repasar mis fallos»: una tarjeta por fallo, sin IA (pregunta → respuesta correcta).
      await cardsImport(
        examId,
        items.map((i) => ({ front: i.prompt.slice(0, 300), back: String(i.correct_answer || i.solution).slice(0, 300) })),
      );
      setCards("done");
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <BottomSheet labelledBy="mis-fallos" onClose={onClose}>
      <h2 id="mis-fallos">Tus fallos</h2>
      <ul className={s.fails}>
        {items.map((i) => (
          <li key={i.id} className={s.fail}>
            <p className={sf.topic}>{i.topic}</p>
            <div className={s.failQ}>
              <Markdown content={i.prompt} />
            </div>
            <p className={s.small}>
              <XIcon size={14} aria-hidden="true" /> Tu respuesta: {i.answer || "sin contestar"}
            </p>
            {i.type !== "written" && (
              <p className={s.small}>
                <Check size={14} aria-hidden="true" /> La correcta: {i.correct_answer}
              </p>
            )}
            {i.reason && <p className={s.small}>Salió porque: {i.reason}</p>}
            {i.criteria && (
              <ul className={s.criteria}>
                {i.criteria.map((c) => (
                  <li key={c.criterion}>
                    {c.met ? <Check size={14} aria-label="Cumplido" /> : <XIcon size={14} aria-label="Faltó" />} {c.criterion}
                  </li>
                ))}
              </ul>
            )}
            {i.improved && (
              <details className={s.details}>
                <summary>Versión mejorada de tu respuesta</summary>
                <Markdown content={i.improved} />
              </details>
            )}
            <details className={s.details}>
              <summary>Solución detallada</summary>
              <Markdown content={i.solution} />
            </details>
            <label className={s.cause}>
              Causa
              <select value={i.cause ?? "concepto"} onChange={(e) => {
                onChange(i.id, { cause: e.target.value, cause_confirmed: true });
                void mockCause(examId, sessionId, i.id, e.target.value).catch(() => undefined);
              }}>
                {CAUSES.map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {i.dispute && (
              <p className={s.small} role="status">
                {i.dispute.message}
              </p>
            )}
            {arguing === i.id ? (
              <div className={s.argue}>
                <label>
                  Cuéntame por qué crees que está bien
                  <textarea rows={3} maxLength={800} value={text} onChange={(e) => setText(e.target.value)} />
                </label>
                <div className="modal-actions">
                  <button className="secondary press" onClick={() => setArguing(null)}>
                    Cancelar
                  </button>
                  <button className="primary press" disabled={busy || text.trim().length < 5} onClick={() => void dispute(i)}>
                    Enviar
                  </button>
                </div>
              </div>
            ) : (
              i.disputes < 2 && (
                <button type="button" className={`secondary press ${s.smallBtn}`} onClick={() => setArguing(i.id)}>
                  No estoy de acuerdo
                </button>
              )
            )}
          </li>
        ))}
      </ul>
      {msg && (
        <p className={s.small} role="alert">
          {msg}
        </p>
      )}
      <div className="modal-actions">
        {cards === "done" ? (
          <Link className="primary press" href={`/exams/${examId}/tarjetas`}>
            Ver mis tarjetas
          </Link>
        ) : (
          <button className="primary press" disabled={busy} onClick={() => void toCards()}>
            Repasar mis fallos
          </button>
        )}
        <button className="secondary press" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </BottomSheet>
  );
}
