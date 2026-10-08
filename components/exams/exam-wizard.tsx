"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ArrowLeft, Upload, Check } from "lucide-react";
import { callDream, errorMessage } from "@/lib/dream-api";
import {
  getExam,
  updateExam,
  type DreamExam,
  type ExamFields,
} from "@/lib/exam-plans";
import { fileAccept, validateFile, toBase64 } from "@/lib/attachments";
import { AttachmentItem } from "../attachment";
import { DreamMark, DreamActivity } from "../dream-mark";
import type { Attachment } from "@/lib/types";
import {
  ExamFrame,
  ExamLoad,
  ErrorNotice,
  Countdown,
  Materials,
  styles,
} from "./exam-ui";
const initial: ExamFields = {
  title: "",
  subject: "",
  exam_date: "",
  topics: [],
  difficulties: "",
  goal: "",
  daily_minutes: 20,
};
export function ExamWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const [fields, setFields] = useState<ExamFields>(initial);
  const [exam, setExam] = useState<DreamExam | null>(null);
  const [topics, setTopics] = useState("");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!!params.get("id"));
  const [files, setFiles] = useState<Attachment[]>([]);
  const examId = useRef(params.get("id") || crypto.randomUUID());
  const lock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const creation = useRef<Promise<DreamExam> | null>(null);
  const loadedId = useRef<string | null>(null);
  const liveFiles = useRef<Attachment[]>([]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const file of liveFiles.current)
        if (file.preview) URL.revokeObjectURL(file.preview);
    };
  }, []);
  useEffect(() => {
    const id = params.get("id");
    if (!id || loadedId.current === id) return;
    const c = new AbortController();
    getExam(id, c.signal)
      .then((e) => {
        if (c.signal.aborted) return;
        loadedId.current = e.id;
        setExam(e);
        setFields(e);
        setTopics(e.topics.join("\n"));
        if (e.status === "ready" || e.status === "completed")
          router.replace(`/exams/${id}`);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [params, router]);
  function change<K extends keyof ExamFields>(key: K, value: ExamFields[K]) {
    setFields((s) => ({ ...s, [key]: value }));
  }
  const values = () => ({
    ...fields,
    topics: topics
      .split(/\n|;/)
      .map((t) => t.trim())
      .filter(Boolean),
  });
  async function save() {
    if (creation.current) return creation.current;
    const pending = updateExam(
      exam ? "exam_update" : "exam_create",
      examId.current,
      values(),
    )
      .then((e) => {
        loadedId.current = e.id;
        if (mounted.current) setExam(e);
        if (!params.get("id"))
          router.replace(`/exams/new?id=${e.id}`, { scroll: false });
        return e;
      })
      .finally(() => {
        creation.current = null;
      });
    creation.current = pending;
    return pending;
  }
  async function next() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await save();
      setStep((s) => Math.min(2, s + 1));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function setFile(localId: string, patch: Partial<Attachment>) {
    liveFiles.current = liveFiles.current.map((a) =>
      a.localId === localId ? { ...a, ...patch } : a,
    );
    if (mounted.current) setFiles(liveFiles.current);
  }
  async function upload(file: Attachment) {
    try {
      validateFile(file.file);
      setFile(file.localId, { status: "uploading", error: undefined });
      const saved = exam || (await save());
      const { conversation_id } = await callDream<{ conversation_id: string }>(
        "exam_upload_start",
        { exam_id: saved.id },
      );
      const content_base64 = await toBase64(file.file);
      setFile(file.localId, { status: "processing" });
      const { attachment } = await callDream<{ attachment: { id: string } }>(
        "attachment_upload",
        {
          conversation_id,
          file_name: file.file.name,
          mime_type: file.file.type,
          content_base64,
        },
      );
      const updated = await updateExam("exam_material_add", saved.id, {
        attachment_id: attachment.id,
      });
      if (mounted.current) setExam(updated);
      setFile(file.localId, { id: attachment.id, status: "ready" });
    } catch (e) {
      setFile(file.localId, { status: "error", error: errorMessage(e) });
    }
  }
  async function attach(list: File[]) {
    if (busy) return;
    setError("");
    if (
      (exam?.materials.length || 0) +
        liveFiles.current.filter((f) => !f.id).length +
        list.length >
      4
    ) {
      setError("Puedes adjuntar hasta 4 archivos en este plan.");
      return;
    }
    const added = list.map((file) => ({
      localId: crypto.randomUUID(),
      file,
      status: "uploading" as const,
      preview: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined,
    }));
    liveFiles.current = [...liveFiles.current, ...added];
    setFiles(liveFiles.current);
    for (const item of added) await upload(item);
  }
  async function removeFile(file: Attachment) {
    try {
      if (file.id && exam)
        setExam(
          await updateExam("exam_material_remove", exam.id, {
            attachment_id: file.id,
          }),
        );
      if (file.preview) URL.revokeObjectURL(file.preview);
      liveFiles.current = liveFiles.current.filter(
        (a) => a.localId !== file.localId,
      );
      setFiles(liveFiles.current);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function generate() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setStep(3);
    try {
      const saved = await save();
      setExam(await updateExam("exam_prepare", saved.id));
      router.replace(`/exams/${saved.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const pending = files.some((f) => f.status !== "ready");
  const storedMaterials =
    exam?.materials.filter((m) => !files.some((f) => f.id === m.id)) || [];
  if (loading)
    return <ExamLoad error={error} reload={() => router.refresh()} />;
  const titles = [
    "Empecemos por tu examen.",
    "Tus apuntes son el punto de partida.",
    "Todo listo para organizarte.",
    "Tus apuntes empiezan a encajar.",
  ];
  return (
    <ExamFrame
      eyebrow={
        step === 3
          ? "DREAM ESTÁ PREPARANDO TU PLAN"
          : `NUEVO EXAMEN / PASO ${step + 1} DE 3`
      }
      title={titles[step]}
      subtitle={
        step === 3
          ? "Del material al siguiente paso."
          : "Tres pasos sencillos. Dream se ocupa de organizar el resto."
      }
      aside={
        <>
          {fields.exam_date && (
            <Countdown
              exam={{ exam_date: fields.exam_date, title: fields.title }}
            />
          )}
          <section className={`${styles.card} ${step > 0 ? styles.lime : ""}`}>
            <h2>
              {step === 0
                ? "Una fecha. Un punto de partida."
                : step === 1
                  ? "De tu temario a tu plan."
                  : "Esto preparará Dream."}
            </h2>
            <p>
              {step === 0
                ? "Añade lo que quieres preparar. Tú eliges el ritmo."
                : step === 1
                  ? "Tus temas y materiales ayudarán a Dream a dividir la preparación en pasos manejables."
                  : "Unidades de estudio, conversaciones para entenderlas y práctica basada en tus temas."}
            </p>
            <small>{fields.daily_minutes} minutos al día · A tu ritmo</small>
          </section>
        </>
      }
    >
      {step < 3 && (
        <ol className={styles.steps} aria-label="Pasos del asistente">
          {["Datos", "Materiales", "Revisar"].map((name, i) => (
            <li
              className={styles.step}
              key={name}
              aria-current={i === step ? "step" : undefined}
            >
              <span>{i < step ? <Check size={14} /> : i + 1}</span>
              {i + 1} · {name}
            </li>
          ))}
        </ol>
      )}
      {step === 0 && (
        <form
          className={`${styles.card} ${styles.form}`}
          onSubmit={(e) => {
            e.preventDefault();
            void next();
          }}
        >
          <h2>¿Qué vas a preparar?</h2>
          <label>
            Nombre del examen
            <input
              value={fields.title}
              onChange={(e) => change("title", e.target.value)}
              maxLength={160}
              required
              placeholder="Por ejemplo, Álgebra · primer trimestre"
            />
          </label>
          <div className={styles.row}>
            <label>
              Asignatura
              <input
                list="exam-subjects"
                value={fields.subject}
                onChange={(e) => change("subject", e.target.value)}
                maxLength={80}
                required
                placeholder="Elige o escribe una asignatura"
              />
              <datalist id="exam-subjects">
                {[
                  "Matemáticas",
                  "Biología",
                  "Física y Química",
                  "Lengua y Literatura",
                  "Inglés",
                  "Historia",
                  "Programación",
                  "Filosofía",
                  "Economía",
                ].map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label>
              Fecha del examen
              <input
                type="date"
                value={fields.exam_date}
                onChange={(e) => change("exam_date", e.target.value)}
                required
              />
            </label>
          </div>
          <label>
            ¿Qué te gustaría conseguir?
            <input
              value={fields.goal}
              onChange={(e) => change("goal", e.target.value)}
              maxLength={1000}
              placeholder="Entender las ideas y llegar con confianza"
            />
          </label>
          <label>
            Tu rato de estudio al día
            <select
              value={fields.daily_minutes}
              onChange={(e) => change("daily_minutes", Number(e.target.value))}
            >
              {[5, 10, 15, 20, 30, 45, 60, 90, 120].map((v) => (
                <option value={v} key={v}>
                  {v} minutos
                </option>
              ))}
            </select>
          </label>
          <div className={styles.actions}>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => router.push("/exams")}
            >
              Cancelar <ArrowRight size={18} />
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "Guardando…" : "Siguiente: materiales"}{" "}
              <ArrowRight size={18} />
            </button>
          </div>
        </form>
      )}
      {step === 1 && (
        <section className={`${styles.card} ${styles.form}`}>
          <h2>¿Qué entra en el examen?</h2>
          <label>
            Temas
            <textarea
              aria-label="Temas"
              aria-describedby="exam-topics-help"
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
              placeholder="Un tema por línea"
              maxLength={5000}
            />
            <small id="exam-topics-help">
              Hasta 30 temas. Puedes separarlos por líneas o punto y coma.
            </small>
          </label>
          <label>
            ¿Qué te cuesta más?
            <textarea
              value={fields.difficulties}
              onChange={(e) => change("difficulties", e.target.value)}
              maxLength={4000}
              placeholder="Cuéntale a Dream dónde te atascas"
            />
          </label>
          <input
            ref={input}
            type="file"
            accept={fileAccept}
            multiple
            className="visually-hidden"
            aria-label="Adjuntar materiales del examen"
            onChange={(e) => {
              void attach(Array.from(e.target.files || []));
              e.target.value = "";
            }}
          />
          <button
            className={styles.dropzone}
            disabled={busy}
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void attach(Array.from(e.dataTransfer.files));
            }}
          >
            <Upload size={28} />
            <span>Añade tus apuntes</span>
            <small>
              PDF, Word, imágenes, PowerPoint, Excel y más.
              <br />
              Hasta 4 archivos · Documentos e imágenes: 8 MB · Texto: 500 KB
            </small>
          </button>
          {storedMaterials.map((m) => (
            <div key={m.id}>
              <Materials materials={[m]} />
              <button
                className={styles.inlineLink}
                disabled={busy}
                onClick={() =>
                  void updateExam("exam_material_remove", examId.current, {
                    attachment_id: m.id,
                  })
                    .then(setExam)
                    .catch((e) => setError(errorMessage(e)))
                }
              >
                Eliminar {m.file_name}
              </button>
            </div>
          ))}
          {files.map((f) => (
            <AttachmentItem
              key={f.localId}
              attachment={f}
              busy={
                busy || f.status === "uploading" || f.status === "processing"
              }
              onRemove={() => void removeFile(f)}
              onRetry={() => void upload(f)}
            />
          ))}
          <div className={styles.actions}>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setStep(0)}
            >
              <ArrowLeft size={16} /> Volver
            </button>
            <button
              className="primary"
              disabled={busy || pending || !topics.trim()}
              onClick={() => void next()}
            >
              {busy ? "Guardando…" : "Revisar mi examen"}{" "}
              <ArrowRight size={18} />
            </button>
          </div>
        </section>
      )}
      {step === 2 && (
        <section className={styles.card}>
          <div className={styles.examCardTop}>
            <h2>{fields.title}</h2>
            <button
              className={styles.inlineLink}
              disabled={busy}
              onClick={() => setStep(0)}
            >
              Editar datos
            </button>
          </div>
          <dl className={styles.summary}>
            <div>
              <dt>Asignatura</dt>
              <dd>{fields.subject}</dd>
            </div>
            <div>
              <dt>Fecha</dt>
              <dd>{fields.exam_date}</dd>
            </div>
            <div>
              <dt>Temas</dt>
              <dd className={styles.chips}>
                {values().topics.map((t, i) => (
                  <span className={styles.badge} key={i}>
                    {t}
                  </span>
                ))}
              </dd>
            </div>
            {fields.difficulties && (
              <div>
                <dt>Por reforzar</dt>
                <dd>{fields.difficulties}</dd>
              </div>
            )}
            <div>
              <dt>Materiales</dt>
              <dd>
                <Materials materials={exam?.materials || []} />
              </dd>
            </div>
          </dl>
          <div className={styles.actions}>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setStep(1)}
            >
              Volver a materiales
            </button>
            <button
              className="primary"
              disabled={busy || pending}
              onClick={() => void generate()}
            >
              Generar plan de estudio <ArrowRight size={18} />
            </button>
          </div>
        </section>
      )}
      {step === 3 && (
        <section className={`${styles.card} ${styles.preparing}`}>
          <DreamMark size={96} />
          <DreamActivity state={error ? "error" : "thinking"} />
          <h2>
            {error ? "Lo retomamos cuando quieras." : "Organizando tus temas"}
          </h2>
          <p>
            {error
              ? "Tus datos y materiales están guardados en tu cuenta."
              : "Dream está construyendo tu plan a partir de los temas y materiales guardados. Puedes volver a este borrador si sales de la página."}
          </p>
          <Materials materials={exam?.materials || []} />
          {!busy && (
            <div className={styles.actions}>
              <button className="secondary" onClick={() => setStep(2)}>
                Revisar datos
              </button>
              <button className="primary" onClick={() => void generate()}>
                Reintentar preparación
              </button>
            </div>
          )}
        </section>
      )}
      <ErrorNotice error={error} />
    </ExamFrame>
  );
}
