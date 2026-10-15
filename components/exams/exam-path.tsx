"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Check, Lock, Play, Share2 } from "lucide-react";
import { examDateLabel } from "@/lib/exam-plans";
import {
  pathAnnouncement,
  shareProgress,
  shareText,
  studyPath,
  type PathNode,
} from "@/lib/study-path";
import { Toast } from "../toast";
import {
  Countdown,
  ExamFrame,
  ExamLoad,
  ErrorNotice,
  ProgressLine,
  useExam,
  styles,
} from "./exam-ui";

const ICONS = {
  completed: Check,
  current: Play,
  next: ArrowRight,
  started: Play,
  open: BookOpen,
  locked: Lock,
} as const;

function PathStep({
  examId,
  node,
  total,
}: {
  examId: string;
  node: PathNode;
  total: number;
}) {
  const Icon = ICONS[node.state];
  const body = (
    <>
      <span className={styles.pathDot} aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className={styles.pathCopy}>
        <small>
          Tema {node.unit.position + 1} de {total}
        </small>
        <strong>{node.unit.title}</strong>
        <span className={styles.pathState}>{node.label}</span>
      </span>
      {node.unlocked && <ArrowRight size={18} aria-hidden="true" />}
    </>
  );
  return (
    <li
      className={styles.pathStep}
      data-state={node.state}
      aria-current={node.state === "current" ? "step" : undefined}
    >
      {node.unlocked ? (
        <Link
          className={`${styles.pathNode} press`}
          href={`/exams/${examId}/study/${node.unit.id}`}
        >
          {body}
        </Link>
      ) : (
        <div className={styles.pathNode} aria-disabled="true">
          {body}
        </div>
      )}
    </li>
  );
}

export function ExamPath({ id }: { id: string }) {
  const { exam, error, loading, reload } = useExam(id);
  const [notice, setNotice] = useState<{ text: string; error: boolean }>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (loading || !exam) return <ExamLoad error={error} reload={reload} />;
  const back = (
    <Link className={styles.inlineLink} href={`/exams/${id}`}>
      Volver al examen
    </Link>
  );
  if (!exam.units.length)
    return (
      <ExamFrame eyebrow="TU RUTA" title="Tu ruta, paso a paso.">
        <section className={styles.card}>
          <p>Tu ruta aparecerá cuando Dream haya preparado tu plan.</p>
          <Link className="primary" href={`/exams/${id}`}>
            Ir a mi examen <ArrowRight size={18} />
          </Link>
        </section>
        {back}
      </ExamFrame>
    );
  const path = studyPath(exam.units);
  const ahead = path.next ?? path.current;
  async function share() {
    const outcome = await shareProgress(
      shareText(exam!.subject, exam!.units),
      navigator,
    );
    if (outcome === "shared" || outcome === "cancelled") return;
    clearTimeout(timer.current);
    setNotice(
      outcome === "copied"
        ? { text: "Copiado", error: false }
        : {
            text: "No se pudo compartir. Inténtalo de nuevo.",
            error: true,
          },
    );
    timer.current = setTimeout(() => setNotice(undefined), 4000);
  }
  return (
    <ExamFrame
      eyebrow="TU RUTA"
      title="Tu ruta, paso a paso."
      subtitle={`${exam.subject} · ${examDateLabel(exam.exam_date)}`}
      aside={
        <>
          <Countdown exam={exam} />
          <section className={styles.card}>
            <h3>Comparte tu avance</h3>
            <p>
              Solo se comparte tu porcentaje y tus temas. Nunca tu nombre ni tus
              conversaciones.
            </p>
            <button className="secondary press" onClick={() => void share()}>
              <Share2 size={18} aria-hidden="true" /> Compartir
            </button>
          </section>
        </>
      }
    >
      <section className={styles.card}>
        <div className={styles.examCardTop}>
          <h2 className={styles.pathPercent}>{path.percentage} %</h2>
          <span className={styles.badge}>
            {path.completed} de {path.total} temas
          </span>
        </div>
        <ProgressLine value={path.percentage} label="Avance de tu ruta" />
        <p>
          {ahead
            ? `A continuación: ${ahead.unit.title}.`
            : "Has completado tu ruta. Puedes repasar cualquier tema."}
        </p>
        {ahead && (
          <Link
            className="primary"
            href={`/exams/${id}/study/${ahead.unit.id}`}
          >
            Seguir con mi ruta <ArrowRight size={18} />
          </Link>
        )}
      </section>
      <h2 className={styles.sectionTitle} id="ruta-temas">
        Tus temas
      </h2>
      <p className="visually-hidden" role="status">
        {pathAnnouncement(path)}
      </p>
      <ol className={styles.path} aria-labelledby="ruta-temas">
        {path.nodes.map((node) => (
          <PathStep
            key={node.unit.id}
            examId={id}
            node={node}
            total={path.total}
          />
        ))}
      </ol>
      <p className={styles.muted}>
        Los temas bloqueados se abren al avanzar. Tu avance refleja las unidades
        que completas, no una nota.
      </p>
      {back}
      <ErrorNotice error={error} />
      <div className="toast-position" aria-live="polite">
        {notice && (
          <Toast
            message={notice.text}
            error={notice.error}
            onClose={() => setNotice(undefined)}
          />
        )}
      </div>
    </ExamFrame>
  );
}
