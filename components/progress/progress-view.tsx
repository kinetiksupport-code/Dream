"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { ArrowRight, Check, Lock } from "lucide-react";
import { errorMessage } from "@/lib/dream-api";
import { AnimatedNumber } from "@/components/animated-number";
import {
  countdownLabel,
  examDateLabel,
  sessionPath,
  type ExamIndex,
} from "@/lib/exam-plans";
import {
  buildProgress,
  dayKey,
  mondayOf,
  pickDefaultExam,
  FORECAST_MIN_ACTIVITIES,
  type ExamProgress,
  type Forecast,
  type PracticeResult,
  type TopicProgress,
} from "@/lib/progress";
import {
  listProgressExams,
  loadExamProgress,
  type ExamProgressData,
} from "@/lib/progress-data";
import styles from "./progress.module.css";

type Load<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

/**
 * A count or percentage that rolls up from 0 once when it appears, and rolls
 * again if it changes (AnimatedNumber: transform and opacity, 200 ms; a fade
 * with reduced motion). Screen readers read the final text once.
 */
function CountUp({
  value,
  format,
}: {
  value: number;
  format: (value: number) => string;
}) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return <AnimatedNumber value={shown} format={format} />;
}

const TABS = [
  { id: "preparacion", label: "Preparación" },
  { id: "simulacros", label: "Simulacros" },
  { id: "ritmo", label: "Ritmo" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const pct = (n: number) => `${n} %`;
const decimal = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const shortDate = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
});
function dateLabel(iso: string | null) {
  if (!iso) return "Sin fecha";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : shortDate.format(date);
}
function weekLabel(start: string, now: Date) {
  if (start === dayKey(mondayOf(now))) return "Esta semana";
  const [y, m, d] = start.split("-").map(Number);
  return `Semana del ${shortDate.format(new Date(y, m - 1, d))}`;
}
function daysLabel(days: number | null) {
  if (days === null) return "Sin fecha";
  if (days < 0) return "Ya pasó";
  if (days === 0) return "Hoy";
  return days === 1 ? "1 día" : `${days} días`;
}
const KIND_LABEL: Record<PracticeResult["kind"], string> = {
  simulacro: "Simulacro",
  tema: "Test de tema",
  repaso: "Repaso de errores",
};
const isPlanned = (e: ExamIndex) =>
  e.status === "ready" || e.status === "completed";

/** Design: "Progreso". Everything is computed from saved data, no AI. */
export function ProgressView() {
  const [index, setIndex] = useState<Load<ExamIndex[]>>({ status: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Load<ExamProgressData> | null>(null);
  const [indexAttempt, setIndexAttempt] = useState(0);
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [tab, setTab] = useState<TabId>("preparacion");

  useEffect(() => {
    const controller = new AbortController();
    setIndex({ status: "loading" });
    listProgressExams(controller.signal)
      .then((exams) => {
        setIndex({ status: "ready", data: exams });
        setSelected(
          (current) =>
            (exams.some((e) => e.id === current && isPlanned(e))
              ? current
              : pickDefaultExam(exams.filter(isPlanned))?.id) ?? null,
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setIndex({ status: "error", message: errorMessage(e) });
      });
    return () => controller.abort();
  }, [indexAttempt]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setDetail({ status: "loading" });
    loadExamProgress(selected, controller.signal)
      .then((data) => setDetail({ status: "ready", data }))
      .catch((e) => {
        if (!controller.signal.aborted)
          setDetail({ status: "error", message: errorMessage(e) });
      });
    return () => controller.abort();
  }, [selected, detailAttempt]);

  const progress = useMemo(
    () =>
      detail?.status === "ready"
        ? buildProgress(detail.data.exam, detail.data.results, new Date())
        : null,
    [detail],
  );

  const planned = index.status === "ready" ? index.data.filter(isPlanned) : [];
  const drafts =
    index.status === "ready" ? index.data.filter((e) => !isPlanned(e)) : [];

  return (
    <div className={`page page-wide ${styles.page}`}>
      <header className="page-header">
        <div className={styles.heading}>
          <h1 className={`hero-title ${styles.title}`}>
            <span className="marker marker-draw">Progreso</span>
          </h1>
          <p className="page-intro">
            Calculado con lo que ya has hecho en Dream: unidades completadas y
            tests corregidos.
          </p>
        </div>
        {planned.length > 1 && (
          <label className={`field ${styles.picker}`}>
            Examen
            <select
              value={selected ?? ""}
              onChange={(e) => {
                setSelected(e.target.value);
                setTab("preparacion");
              }}
            >
              {planned.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} · {countdownLabel(e.exam_date)}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {index.status === "loading" && <Skeleton />}
      {index.status === "error" && (
        <LoadError
          title="No se pudo cargar tu progreso"
          message={index.message}
          onRetry={() => setIndexAttempt((n) => n + 1)}
        />
      )}
      {index.status === "ready" && !planned.length && (
        <Empty draft={drafts[0]} />
      )}
      {index.status === "ready" && planned.length > 0 && (
        <>
          {(!detail || detail.status === "loading") && <Skeleton />}
          {detail?.status === "error" && (
            <LoadError
              title="No se pudo cargar este examen"
              message={detail.message}
              onRetry={() => setDetailAttempt((n) => n + 1)}
            />
          )}
          {detail?.status === "ready" && progress && (
            <ExamProgressView
              data={detail.data}
              progress={progress}
              tab={tab}
              onTab={setTab}
            />
          )}
        </>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="skeleton-list" role="status" aria-label="Cargando">
      <span />
      <span />
      <span />
    </div>
  );
}

function LoadError({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="empty-state state-error" role="alert">
      <h2>{title}</h2>
      <p>{message}</p>
      <button className="secondary press" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}

function Empty({ draft }: { draft?: ExamIndex }) {
  return (
    <div className="empty-state">
      <h2>
        {draft ? "Tu plan aún no está listo" : "Aún no hay nada que medir"}
      </h2>
      <p>
        {draft
          ? `Termina de preparar «${draft.title}». Cuando Dream organice tus temas en unidades, aquí verás tu preparación, tus lagunas y tu ritmo.`
          : "Crea un examen con tus temas y su fecha. Dream lo divide en unidades y, a medida que estudies y hagas tests, aquí verás cuánto te falta."}
      </p>
      <Link
        className="primary press"
        href={draft ? `/exams/new?id=${draft.id}` : "/exams/new"}
      >
        {draft ? "Seguir preparando" : "Crear un examen"}{" "}
        <ArrowRight size={18} />
      </Link>
    </div>
  );
}

function ExamProgressView({
  data,
  progress,
  tab,
  onTab,
}: {
  data: ExamProgressData;
  progress: ExamProgress;
  tab: TabId;
  onTab: (tab: TabId) => void;
}) {
  const { exam } = data;
  return (
    <>
      <section className={styles.summary} aria-labelledby="progress-summary">
        <h2 id="progress-summary" className="visually-hidden">
          Resumen de {exam.title}
        </h2>
        <ReadinessRing value={progress.readiness} target={progress.target} />
        <dl className={`${styles.kpis} stagger`}>
          <div className={styles.kpi}>
            <dt>Temas en el objetivo</dt>
            <dd>
              <strong>
                <CountUp
                  value={progress.topicsAtTarget}
                  format={(n) => `${n} de ${progress.topicsInPlan}`}
                />
              </strong>
              <span>con un {pct(progress.target)} o más</span>
            </dd>
          </div>
          <div className={styles.kpi}>
            <dt>Para el examen</dt>
            <dd>
              <strong>
                {progress.daysLeft !== null && progress.daysLeft > 0 ? (
                  <CountUp value={progress.daysLeft} format={daysLabel} />
                ) : (
                  daysLabel(progress.daysLeft)
                )}
              </strong>
              <span>
                {progress.daysLeft === null
                  ? "Añade la fecha a tu examen"
                  : examDateLabel(exam.exam_date)}
              </span>
            </dd>
          </div>
          <div className={styles.kpi}>
            <dt>Actividades hechas</dt>
            <dd>
              <strong>
                <CountUp value={progress.activities} format={String} />
              </strong>
              <span>unidades y tests</span>
            </dd>
          </div>
        </dl>
      </section>
      {data.failed > 0 && (
        <p className={styles.notice} role="status">
          No se pudieron cargar {data.failed}{" "}
          {data.failed === 1 ? "resultado" : "resultados"}. Los porcentajes usan
          solo los que sí se cargaron.
        </p>
      )}
      <Tabs tab={tab} onTab={onTab}>
        {tab === "preparacion" && (
          <PreparationPanel progress={progress} examId={exam.id} />
        )}
        {tab === "simulacros" && (
          <TestsPanel progress={progress} examId={exam.id} />
        )}
        {tab === "ritmo" && (
          <RhythmPanel progress={progress} examId={exam.id} />
        )}
      </Tabs>
    </>
  );
}

function Tabs({
  tab,
  onTab,
  children,
}: {
  tab: TabId;
  onTab: (tab: TabId) => void;
  children: ReactNode;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = TABS.findIndex((t) => t.id === tab);
    const next =
      event.key === "ArrowRight"
        ? (current + 1) % TABS.length
        : event.key === "ArrowLeft"
          ? (current - 1 + TABS.length) % TABS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? TABS.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    onTab(TABS[next].id);
    refs.current[next]?.focus();
  }
  return (
    <div className={styles.tabsBlock}>
      <div
        className={styles.tabs}
        role="tablist"
        aria-label="Vistas de progreso"
        onKeyDown={onKeyDown}
      >
        <span
          className={styles.tabIndicator}
          aria-hidden="true"
          style={{
            transform: `translateX(calc(${TABS.findIndex((t) => t.id === tab)} * (100% + 4px)))`,
          }}
        />
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className="press"
            onClick={() => onTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        id={`panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        tabIndex={0}
        className={styles.panel}
      >
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ graphics */

function ReadinessRing({ value, target }: { value: number; target: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const angle = (target / 100) * 2 * Math.PI - Math.PI / 2;
  const reached = value >= target;
  return (
    <div
      className={styles.ring}
      role="progressbar"
      aria-label="Preparación para el examen"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${pct(value)}; objetivo ${pct(target)}`}
    >
      <svg viewBox="0 0 128 128" aria-hidden="true" focusable="false">
        <circle className={styles.ringTrack} cx="64" cy="64" r={r} />
        <g transform="rotate(-90 64 64)">
          <circle
            className={`${styles.ringValue} ${reached ? styles.reached : ""}`}
            cx="64"
            cy="64"
            r={r}
            strokeDasharray={`${(value / 100) * c} ${c}`}
          />
        </g>
        <line
          className={styles.ringTarget}
          x1={64 + (r - 7) * Math.cos(angle)}
          y1={64 + (r - 7) * Math.sin(angle)}
          x2={64 + (r + 9) * Math.cos(angle)}
          y2={64 + (r + 9) * Math.sin(angle)}
        />
      </svg>
      <div className={styles.ringLabel}>
        <strong>
          <CountUp value={value} format={pct} />
        </strong>
        <span>Objetivo {pct(target)}</span>
      </div>
    </div>
  );
}

function Bar({
  value,
  label,
  target,
  tone,
}: {
  value: number;
  label: string;
  target?: number;
  tone?: "reached";
}) {
  return (
    <div
      className={`${styles.bar} ${tone === "reached" ? styles.reached : ""}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={pct(value)}
    >
      <i style={{ transform: `scaleX(${value / 100})` }} />
      {target !== undefined && (
        <b style={{ left: `${target}%` }} aria-hidden="true" />
      )}
    </div>
  );
}

/* ---------------------------------------------------------- Preparación */

function PreparationPanel({
  progress,
  examId,
}: {
  progress: ExamProgress;
  examId: string;
}) {
  return (
    <div className={`${styles.stack} stagger`}>
      <ForecastCard forecast={progress.forecast} target={progress.target} />
      <GapsCard progress={progress} examId={examId} />
      <TopicList progress={progress} />
      <SkillTree progress={progress} />
      <details className={styles.howto}>
        <summary>¿Cómo se calcula?</summary>
        <ul>
          <li>
            Cada tema vale la mitad por lo que has estudiado (unidades
            completadas) y la otra mitad por tus tests (media de los 3 últimos
            de ese tema; si no hay, la de tus simulacros).
          </li>
          <li>
            Solo estudiar llega como mucho al {pct(50)}: para alcanzar el
            objetivo hace falta un test que lo demuestre.
          </li>
          <li>Tu preparación es la media de los temas de tu plan.</li>
          <li>
            La previsión suma a tu preparación lo que has subido cada día en las
            últimas 2 semanas, multiplicado por los días que faltan.
          </li>
        </ul>
      </details>
    </div>
  );
}

function ForecastCard({
  forecast,
  target,
}: {
  forecast: Forecast;
  target: number;
}) {
  return (
    <section className={styles.card} aria-labelledby="forecast-title">
      <h2 id="forecast-title">Previsión para el examen</h2>
      <ForecastBody forecast={forecast} target={target} />
    </section>
  );
}

function ForecastBody({
  forecast,
  target,
}: {
  forecast: Forecast;
  target: number;
}) {
  if (forecast.status === "no_date")
    return (
      <p className={styles.muted}>
        Tu examen no tiene una fecha válida, así que no podemos prever cómo
        llegarás.
      </p>
    );
  if (forecast.status === "past")
    return (
      <p className={styles.muted}>
        El examen ya pasó. Llegaste con una preparación del{" "}
        {pct(forecast.readiness)}.
      </p>
    );
  if (forecast.status === "locked")
    return (
      <div className={styles.locked}>
        <Lock size={20} aria-hidden="true" />
        <p>
          Completa {forecast.missing}{" "}
          {forecast.missing === 1
            ? "lección o test más"
            : "lecciones o tests más"}{" "}
          para ver tu previsión. Llevas {forecast.activities} de{" "}
          {FORECAST_MIN_ACTIVITIES}.
        </p>
      </div>
    );
  return (
    <>
      <p className={styles.forecastValue}>
        <strong>
          <CountUp value={forecast.projected} format={pct} />
        </strong>
        <span>
          {forecast.daysLeft === 0
            ? "es tu preparación hoy, día del examen"
            : `previstos el día del examen si sigues a este ritmo`}
        </span>
      </p>
      <Bar
        value={forecast.projected}
        target={target}
        label="Preparación prevista para el examen"
        tone={forecast.reachesTarget ? "reached" : undefined}
      />
      <p className={styles.muted}>
        {forecast.reachesTarget
          ? `Vas camino del objetivo (${pct(target)}).`
          : `Con este ritmo no llegas al ${pct(target)}. Una unidad o un test más cada día te acerca.`}{" "}
        Has subido {decimal.format(forecast.dailyGain)} puntos al día en los
        últimos {forecast.windowDays} días. Es una estimación, no una nota.
      </p>
    </>
  );
}

function GapsCard({
  progress,
  examId,
}: {
  progress: ExamProgress;
  examId: string;
}) {
  const { weak, untested, frequentErrors } = progress.gaps;
  const hasTests = progress.tests.results.length > 0;
  // Weak topics are listed above; only mention the remaining untested ones.
  const untestedRest = untested.filter((t) => !weak.includes(t));
  return (
    <section className={styles.card} aria-labelledby="gaps-title">
      <h2 id="gaps-title">Lagunas de conocimiento</h2>
      {!hasTests ? (
        <>
          <p className={styles.muted}>
            Aún no tienes tests corregidos. Haz un simulacro o un test de una
            unidad para descubrir qué te falta.
          </p>
          <Link className="text-link" href={`/exams/${examId}`}>
            Hacer un simulacro <ArrowRight size={16} />
          </Link>
        </>
      ) : (
        <div className={styles.gapGrid}>
          <div>
            <h3>Temas débiles</h3>
            {weak.length ? (
              <ul className={styles.plainList}>
                {weak.slice(0, 5).map((t) => (
                  <li key={t.key}>
                    <span>{t.name}</span>
                    <strong>
                      {pct(t.practice ?? 0)} en{" "}
                      {t.practiceSource === "simulacros"
                        ? "simulacros"
                        : "tests"}
                    </strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>
                Ningún tema con tests por debajo del {pct(progress.target)}.
              </p>
            )}
            {untestedRest.length > 0 && (
              <p className={styles.muted}>
                Sin test propio todavía:{" "}
                {untestedRest.map((t) => t.name).join(", ")}.
              </p>
            )}
          </div>
          <div>
            <h3>Errores frecuentes</h3>
            {frequentErrors.length ? (
              <ul className={styles.errorList}>
                {frequentErrors.map((c) => (
                  <li key={c.concept}>
                    {c.concept}
                    <span>{c.count === 1 ? "1 vez" : `${c.count} veces`}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>
                No hay conceptos fallados pendientes. Los que fallaste ya los
                acertaste después.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function topicDetail(t: TopicProgress) {
  if (!t.inPlan) return "No está en tu plan de estudio";
  const study = `Estudio ${pct(t.study)} (${t.unitsDone} de ${t.units.length})`;
  if (t.practice === null) return `${study} · Sin tests todavía`;
  return `${study} · Tests ${pct(t.practice)}${t.practiceSource === "simulacros" ? " (simulacros)" : ""}`;
}

function TopicList({ progress }: { progress: ExamProgress }) {
  return (
    <section className={styles.card} aria-labelledby="topics-title">
      <h2 id="topics-title">Tus temas</h2>
      {progress.topics.length ? (
        <ul className={styles.topicList}>
          {progress.topics.map((t) => (
            <li key={t.key}>
              <div className={styles.topicHead}>
                <strong>{t.name}</strong>
                <span>
                  {t.mastery === null ? "Sin datos" : pct(t.mastery)}
                  {t.atTarget && (
                    <Check size={16} aria-label="En el objetivo" />
                  )}
                </span>
              </div>
              {t.mastery !== null && (
                <Bar
                  value={t.mastery}
                  target={progress.target}
                  label={`Dominio de ${t.name}`}
                  tone={t.atTarget ? "reached" : undefined}
                />
              )}
              <small>{topicDetail(t)}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>Este examen no tiene temas todavía.</p>
      )}
    </section>
  );
}

function SkillTree({ progress }: { progress: ExamProgress }) {
  const branches = progress.topics.filter((t) => t.inPlan);
  if (!branches.length) return null;
  const names = new Map(progress.topics.map((t) => [t.key, t.name]));
  return (
    <section className={styles.card} aria-labelledby="tree-title">
      <h2 id="tree-title">Árbol de habilidades</h2>
      <p className={styles.muted}>
        Cada rama es un tema de tu examen. Dream aún no guarda qué temas
        dependen de otros: usamos el orden de tu plan como aproximación (cada
        tema se apoya en el anterior).
      </p>
      <ol className={styles.tree}>
        {branches.map((t) => {
          const parent = t.dependsOn ? names.get(t.dependsOn) : null;
          const parentWeak =
            t.dependsOn &&
            (branches.find((b) => b.key === t.dependsOn)?.mastery ?? 0) < 50;
          return (
            <li
              key={t.key}
              className={`${styles.branch} ${t.atTarget ? styles.branchDone : ""}`}
            >
              <span className={styles.node} aria-hidden="true">
                {t.atTarget ? <Check size={16} /> : `${t.mastery ?? 0}`}
              </span>
              <div className={styles.branchBody}>
                <div className={styles.topicHead}>
                  <strong>{t.name}</strong>
                  <span>{pct(t.mastery ?? 0)}</span>
                </div>
                <Bar
                  value={t.mastery ?? 0}
                  target={progress.target}
                  label={`Dominio de ${t.name} en el árbol`}
                  tone={t.atTarget ? "reached" : undefined}
                />
                <small>
                  {parent
                    ? `Se apoya en: ${parent}${parentWeak ? " (refuérzalo antes)" : ""}`
                    : "Punto de partida"}
                </small>
                <ul
                  className={styles.leaves}
                  aria-label={`Unidades de ${t.name}`}
                >
                  {t.units.map((u) => (
                    <li
                      key={u.id}
                      className={
                        u.status === "completed" ? styles.leafDone : ""
                      }
                    >
                      <span aria-hidden="true" />
                      {u.title}
                      <span className="visually-hidden">
                        {u.status === "completed"
                          ? ", completada"
                          : u.status === "in_progress"
                            ? ", en marcha"
                            : ", por empezar"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------ Simulacros */

function TestsPanel({
  progress,
  examId,
}: {
  progress: ExamProgress;
  examId: string;
}) {
  const t = progress.tests;
  if (!t.results.length)
    return (
      <div className="empty-state">
        <h2>Aún no has terminado ningún test</h2>
        <p>
          Cuando entregues un simulacro o el test de una unidad, aquí verás tu
          nota y cómo cambia.
        </p>
        <Link className="primary press" href={`/exams/${examId}`}>
          Hacer un simulacro <ArrowRight size={18} />
        </Link>
      </div>
    );
  const summary = t.results.map((r) => pct(r.percentage)).join(", ");
  return (
    <div className={`${styles.stack} stagger`}>
      <dl className={styles.stats}>
        <div>
          <dt>Media</dt>
          <dd>
            <CountUp value={t.average ?? 0} format={pct} />
          </dd>
        </div>
        <div>
          <dt>Mejor</dt>
          <dd>
            <CountUp value={t.best ?? 0} format={pct} />
          </dd>
        </div>
        <div>
          <dt>Último</dt>
          <dd>
            <CountUp value={t.last ?? 0} format={pct} />
          </dd>
        </div>
        <div>
          <dt>Cambio</dt>
          <dd>
            {t.change === null ? (
              "—"
            ) : (
              <CountUp
                value={t.change}
                format={(n) => `${n > 0 ? "+" : ""}${n} puntos`}
              />
            )}
          </dd>
        </div>
      </dl>
      <section className={styles.card} aria-labelledby="tests-chart">
        <h2 id="tests-chart">Tus notas, de la más antigua a la última</h2>
        <div
          className={styles.columnsChart}
          role="img"
          aria-label={`Notas de tus tests en orden: ${summary}. Objetivo ${pct(progress.target)}.`}
        >
          <b
            className={styles.targetLine}
            style={{ bottom: `${progress.target}%` }}
          />
          {t.results.map((r, i) => (
            <span
              key={r.sessionId}
              className={r.percentage >= progress.target ? styles.reached : ""}
              style={
                {
                  height: `${Math.max(2, r.percentage)}%`,
                  "--i": Math.min(i, 7),
                } as CSSProperties
              }
            />
          ))}
        </div>
        <p className={styles.legend}>
          <b aria-hidden="true" /> Objetivo {pct(progress.target)}
        </p>
      </section>
      <section className={styles.card} aria-labelledby="tests-list">
        <h2 id="tests-list">Resultados</h2>
        <ul className={styles.resultList}>
          {[...t.results].reverse().map((r) => (
            <li key={r.sessionId}>
              <Link className="press" href={sessionPath(examId, r.sessionId)}>
                <span>
                  <strong>{KIND_LABEL[r.kind]}</strong>
                  <small>
                    {dateLabel(r.date)} · {r.score} de {r.total} correctas
                  </small>
                </span>
                <em>{pct(r.percentage)}</em>
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ----------------------------------------------------------------- Ritmo */

function RhythmPanel({
  progress,
  examId,
}: {
  progress: ExamProgress;
  examId: string;
}) {
  const { rhythm, plan, history } = progress;
  const now = new Date();
  const max = Math.max(1, ...history.map((w) => w.unitsCompleted + w.tests));
  const finishLate =
    rhythm.daysToFinish !== null &&
    progress.daysLeft !== null &&
    progress.daysLeft >= 0 &&
    rhythm.daysToFinish > progress.daysLeft;
  return (
    <div className={`${styles.stack} stagger`}>
      <dl className={styles.stats}>
        <div>
          <dt>Tu ritmo reciente</dt>
          <dd>
            <CountUp
              value={rhythm.unitsPerDay}
              format={(n) => `${decimal.format(n)} unidades al día`}
            />
          </dd>
        </div>
        <div>
          <dt>Para acabar a tiempo</dt>
          <dd>
            {rhythm.neededPerDay === null
              ? "—"
              : `${decimal.format(rhythm.neededPerDay)} al día`}
          </dd>
        </div>
        <div>
          <dt>Unidades pendientes</dt>
          <dd>
            <CountUp value={rhythm.pendingUnits} format={String} />
          </dd>
        </div>
        <div>
          <dt>Tiempo diario</dt>
          <dd>
            <CountUp value={rhythm.dailyMinutes} format={(n) => `${n} min`} />
          </dd>
        </div>
      </dl>
      <p className={styles.muted}>
        {rhythm.pendingUnits === 0
          ? "Has completado todas las unidades de tu plan."
          : rhythm.daysToFinish === null
            ? "Aún no has completado unidades en los últimos días, así que no podemos calcular cuándo acabarás."
            : `A este ritmo terminas el plan en ${daysLabel(rhythm.daysToFinish)}${
                finishLate ? ", después del examen." : "."
              }`}
      </p>

      <section className={styles.card} aria-labelledby="weeks-title">
        <h2 id="weeks-title">Lo que has hecho cada semana</h2>
        <ol className={styles.weekBars}>
          {history.map((w, i) => {
            const total = w.unitsCompleted + w.tests;
            return (
              <li
                key={w.start}
                style={{ "--i": Math.min(i, 7) } as CSSProperties}
              >
                <span className={styles.weekName}>
                  {weekLabel(w.start, now)}
                </span>
                <span className={styles.weekTrack} aria-hidden="true">
                  <i style={{ transform: `scaleX(${total / max})` }} />
                </span>
                <span className={styles.weekCount}>
                  {w.unitsCompleted}{" "}
                  {w.unitsCompleted === 1 ? "unidad" : "unidades"} · {w.tests}{" "}
                  {w.tests === 1 ? "test" : "tests"}
                  {w.average !== null && ` · media ${pct(w.average)}`}
                </span>
                {w.topics.length > 0 && (
                  <span className={styles.weekTopics}>
                    Temas: {w.topics.join(", ")}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section className={styles.card} aria-labelledby="plan-title">
        <h2 id="plan-title">Temas por semana hasta el examen</h2>
        {plan.status === "ready" ? (
          <>
            <p className={styles.muted}>
              Propuesta con tus {rhythm.dailyMinutes} minutos al día y las
              duraciones estimadas de cada unidad.
            </p>
            <ol className={styles.planWeeks}>
              {plan.weeks.map((w) => (
                <li key={w.start}>
                  <div className={styles.topicHead}>
                    <strong>{weekLabel(w.start, now)}</strong>
                    <span>{w.minutes} min disponibles</span>
                  </div>
                  <p>{w.topics.join(" · ")}</p>
                  <ul>
                    {w.units.map((u) => (
                      <li key={u.id}>
                        {u.title} <small>{u.minutes} min</small>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
            {plan.overflow > 0 && (
              <p className={styles.notice} role="status">
                {plan.overflow === 1
                  ? "1 unidad no cabe"
                  : `${plan.overflow} unidades no caben`}{" "}
                antes del examen con {rhythm.dailyMinutes} minutos al día.{" "}
                <Link className="text-link" href={`/exams/${examId}`}>
                  Ajustar mi ritmo
                </Link>
              </p>
            )}
          </>
        ) : (
          <p className={styles.muted}>
            {plan.status === "done"
              ? "No te quedan unidades pendientes. Repasa tus lagunas o haz otro simulacro."
              : plan.status === "past"
                ? "El examen ya pasó."
                : plan.status === "no_date"
                  ? "Sin fecha de examen no podemos repartir los temas por semanas."
                  : "Tu plan aún no tiene unidades."}
          </p>
        )}
      </section>
    </div>
  );
}
