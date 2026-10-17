"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  FileText,
  BookOpen,
  ChevronRight,
} from "lucide-react";
import { DreamActivity } from "../dream-mark";
import { errorMessage } from "@/lib/dream-api";
import {
  getExam,
  preparation,
  countdownLabel,
  examDateLabel,
  type DreamExam,
  type ExamUnit,
  type ExamMaterial,
} from "@/lib/exam-plans";
import styles from "./exams.module.css";
export { styles };
export function useExam(id: string) {
  const [exam, setExam] = useState<DreamExam | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    getExam(id, c.signal)
      .then(setExam)
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [id, retry]);
  return {
    exam,
    setExam,
    error,
    setError,
    loading,
    reload: () => setRetry((n) => n + 1),
  };
}
export function ExamFrame({
  eyebrow,
  title,
  subtitle,
  aside,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <p className="eyebrow">{eyebrow}</p>
        <div className={styles.titleRow}>
          <div className={styles.titleCopy}>
            <h1>{title}</h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          {action}
        </div>
      </header>
      <div className={`${styles.columns} ${!aside ? styles.single : ""}`}>
        <div className={styles.main}>{children}</div>
        {aside && <aside className={styles.aside}>{aside}</aside>}
      </div>
      <p className={styles.disclaimer}>
        Dream puede equivocarse. Pregunta, compara y comprende.
      </p>
    </div>
  );
}
export function ExamLoad({
  error,
  reload,
}: {
  error: string;
  reload: () => void;
}) {
  return (
    <div className="boot">
      {error ? (
        <div>
          <p className="error" role="alert">
            {error}
          </p>
          <button className="primary" onClick={reload}>
            Reintentar
          </button>
        </div>
      ) : (
        <DreamActivity state="thinking" />
      )}
    </div>
  );
}
export function ErrorNotice({ error }: { error: string }) {
  return error ? (
    <p className={`${styles.notice} error`} role="alert">
      {error}
    </p>
  ) : null;
}
export function ProgressLine({
  value,
  label,
  valueText,
}: {
  value: number;
  label: string;
  /** Spoken value, e.g. «Pregunta 2 de 5», when a percentage says less. */
  valueText?: string;
}) {
  return (
    <div
      className={styles.progress}
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={valueText}
    >
      <i
        style={{
          transform: `scaleX(${Math.max(0, Math.min(100, value)) / 100})`,
        }}
      />
    </div>
  );
}
export function PreparationProgress({ exam }: { exam: DreamExam }) {
  const p = preparation(exam);
  return (
    <div className={styles.preparation}>
      <strong>
        {p.percentage}% del plan · {p.completed} de {p.total} unidades
      </strong>
      <ProgressLine
        value={p.percentage}
        label="Unidades de preparación completadas"
      />
      <small>Completar una unidad registra tu avance en el plan.</small>
    </div>
  );
}
export function Countdown({
  exam,
}: {
  exam: Pick<DreamExam, "exam_date" | "title">;
}) {
  return (
    <section className={`${styles.card} ${styles.blue}`}>
      <p className={styles.cardEyebrow}>TU PRÓXIMO EXAMEN</p>
      <strong className={styles.countdown}>
        {countdownLabel(exam.exam_date)}
      </strong>
      <p>{examDateLabel(exam.exam_date)}</p>
      <small>Un poco cada día. A tu ritmo.</small>
    </section>
  );
}
export function Materials({ materials }: { materials: ExamMaterial[] }) {
  return (
    <div className={styles.materials}>
      {materials.length ? (
        materials.map((m) => (
          <div className={styles.material} key={m.id}>
            <span className={styles.fileIcon}>
              <FileText size={22} />
            </span>
            <div>
              <strong>{m.file_name}</strong>
              <small>
                Listo · {m.file_name.split(".").pop()?.toUpperCase()} ·{" "}
                {Math.ceil(m.size_bytes / 1024)} KB
              </small>
            </div>
            <Check size={18} />
          </div>
        ))
      ) : (
        <p className={styles.muted}>
          Sin archivos adjuntos. Dream utilizará tus temas y dificultades.
        </p>
      )}
    </div>
  );
}
export function UnitRow({ examId, unit }: { examId: string; unit: ExamUnit }) {
  return (
    <Link
      href={`/exams/${examId}/study/${unit.id}`}
      className={`${styles.unit} ${unit.status === "in_progress" ? styles.selected : ""}`}
    >
      <span
        className={`${styles.unitIcon} ${unit.status === "completed" ? styles.lime : ""}`}
      >
        {unit.status === "completed" ? (
          <Check size={20} />
        ) : (
          <BookOpen size={20} />
        )}
      </span>
      <div>
        <strong>{unit.title}</strong>
        <p>{unit.summary}</p>
        <small>
          {unit.estimated_minutes} min estimados ·{" "}
          {unit.status === "completed"
            ? "Completada"
            : unit.status === "in_progress"
              ? "En marcha"
              : "Por empezar"}
        </small>
      </div>
      <ChevronRight size={20} />
    </Link>
  );
}
export function NextUnit({ exam }: { exam: DreamExam }) {
  const unit = exam.units.find((u) => u.status !== "completed");
  return (
    <section className={`${styles.card} ${styles.lime}`}>
      <p className={styles.cardEyebrow}>UN PASO PEQUEÑO</p>
      <h2>{unit ? unit.title : "Cada idea, más clara."}</h2>
      <p>
        {unit
          ? unit.summary
          : "Has completado las unidades de tu plan. Puedes repasarlas o hacer un simulacro."}
      </p>
      {unit && (
        <Link className="primary" href={`/exams/${exam.id}/study/${unit.id}`}>
          Continuar estudiando <ArrowRight size={18} />
        </Link>
      )}
    </section>
  );
}
