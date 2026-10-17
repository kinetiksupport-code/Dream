"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowRight, Upload } from "lucide-react";
import { callDream, errorMessage } from "@/lib/dream-api";
import {
  daysUntil,
  examDateLabel,
  getExam,
  updateExam,
  type DreamExam,
  type ExamFields,
} from "@/lib/exam-plans";
import { fileAccept, validateFile, toBase64 } from "@/lib/attachments";
import { AttachmentItem } from "../attachment";
import type { Attachment } from "@/lib/types";
import { ErrorNotice, Materials } from "./exam-ui";
import {
  ExamDetailSkeleton,
  ExamPage,
  FailedState,
  PreparingState,
  examStyles as s,
} from "./exam-page";
type FieldKey = "title" | "subject" | "exam_date" | "topics";
type FieldErrors = Partial<Record<FieldKey, string>>;
/** Errors say what is missing and how to fix it (apple writing.md). */
export function validateExam(
  fields: Pick<ExamFields, "title" | "subject" | "exam_date">,
  topics?: string,
): FieldErrors {
  const e: FieldErrors = {};
  if (!fields.title.trim())
    e.title = "Escribe un nombre, por ejemplo «Álgebra · primer trimestre».";
  if (!fields.subject.trim())
    e.subject = "Elige una asignatura de la lista o escríbela.";
  const days = fields.exam_date ? daysUntil(fields.exam_date) : null;
  if (!fields.exam_date) e.exam_date = "Elige el día del examen.";
  else if (days === null) e.exam_date = "Usa una fecha válida (día, mes y año).";
  else if (days < 0) e.exam_date = "Elige hoy o un día futuro.";
  if (topics !== undefined && !topics.trim())
    e.topics = "Añade al menos un tema, uno por línea.";
  return e;
}
function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  return children ? (
    <p className={s.fieldError} id={id}>
      <AlertCircle size={16} aria-hidden="true" />
      {children}
    </p>
  ) : null;
}
function Spinner() {
  return <span className={s.spinner} aria-hidden="true" />;
}
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
  const [invalid, setInvalid] = useState<FieldErrors>({});
  const [failed, setFailed] = useState(false);
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
    setFields((f) => ({ ...f, [key]: value }));
    if (key in invalid) setInvalid((e) => ({ ...e, [key]: undefined }));
  }
  /** Validates the current step; focuses the first field with an error. */
  function check() {
    const errors = validateExam(fields, step === 1 ? topics : undefined);
    if (step === 0) delete errors.topics;
    else if (step === 1) {
      delete errors.title;
      delete errors.subject;
      delete errors.exam_date;
    }
    setInvalid(errors);
    const first = (Object.keys(errors) as FieldKey[])[0];
    if (first) document.getElementById(`exam-${first}`)?.focus();
    return !first;
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
    if (lock.current || !check()) return;
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
    setFailed(false);
    setStep(3);
    try {
      const saved = await save();
      setExam(await updateExam("exam_prepare", saved.id));
      router.replace(`/exams/${saved.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setFailed(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const pending = files.some((f) => f.status !== "ready");
  const storedMaterials =
    exam?.materials.filter((m) => !files.some((f) => f.id === m.id)) || [];
  if (loading) return <ExamDetailSkeleton />;
  const names = ["Datos", "Temas y apuntes", "Revisar"];
  const days = fields.exam_date ? daysUntil(fields.exam_date) : null;
  const describe = (key: FieldKey, help?: string) =>
    [invalid[key] ? `exam-${key}-error` : "", help ?? ""].join(" ").trim() ||
    undefined;
  return (
    <ExamPage
      title={params.get("id") ? "Preparar examen" : "Añadir examen"}
      subtitle={
        step === 3 ? (
          fields.title
        ) : (
          <>
            Paso <span className="num">{step + 1}</span> de{" "}
            <span className="num">3</span> · {names[step]}
          </>
        )
      }
      back={{ href: "/exams", label: "Exámenes" }}
    >
      {step < 3 && (
        <ol className={s.stepper} aria-label="Pasos para añadir el examen">
          {names.map((name, i) => (
            <li
              key={name}
              aria-current={i === step ? "step" : undefined}
              data-done={i < step || undefined}
            >
              {name}
            </li>
          ))}
        </ol>
      )}
      {step === 0 && (
        <form
          className={s.form}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void next();
          }}
        >
          <h2>¿Qué vas a preparar?</h2>
          <div className={s.field}>
            <label htmlFor="exam-title">Nombre del examen</label>
            <input
              id="exam-title"
              value={fields.title}
              onChange={(e) => change("title", e.target.value)}
              maxLength={160}
              required
              aria-invalid={!!invalid.title || undefined}
              aria-describedby={describe("title")}
              placeholder="Por ejemplo, Álgebra · primer trimestre"
            />
            <FieldError id="exam-title-error">{invalid.title}</FieldError>
          </div>
          <div className={s.pair}>
            <div className={s.field}>
              <label htmlFor="exam-subject">Asignatura</label>
              <input
                id="exam-subject"
                list="exam-subjects"
                value={fields.subject}
                onChange={(e) => change("subject", e.target.value)}
                maxLength={80}
                required
                aria-invalid={!!invalid.subject || undefined}
                aria-describedby={describe("subject")}
                placeholder="Elige o escribe una"
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
                ].map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
              <FieldError id="exam-subject-error">{invalid.subject}</FieldError>
            </div>
            <div className={s.field}>
              <label htmlFor="exam-exam_date">Fecha del examen</label>
              <input
                id="exam-exam_date"
                type="date"
                className="num"
                value={fields.exam_date}
                onChange={(e) => change("exam_date", e.target.value)}
                required
                aria-invalid={!!invalid.exam_date || undefined}
                aria-describedby={describe("exam_date", "exam-date-help")}
              />
              <FieldError id="exam-exam_date-error">
                {invalid.exam_date}
              </FieldError>
              {!invalid.exam_date && days !== null && days >= 0 && (
                <p className={s.help} id="exam-date-help" aria-live="polite">
                  {days === 0 ? (
                    "Es hoy."
                  ) : days === 1 ? (
                    "Es mañana."
                  ) : (
                    <>
                      Quedan <span className="num">{days}</span> días.
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
          <div className={s.field}>
            <label htmlFor="exam-goal">
              ¿Qué te gustaría conseguir?{" "}
              <span className={s.optional}>(opcional)</span>
            </label>
            <input
              id="exam-goal"
              value={fields.goal}
              onChange={(e) => change("goal", e.target.value)}
              maxLength={1000}
              placeholder="Entender las ideas y llegar con confianza"
            />
          </div>
          <div className={s.field}>
            <label htmlFor="exam-daily">Tu rato de estudio al día</label>
            <select
              id="exam-daily"
              value={fields.daily_minutes}
              onChange={(e) => change("daily_minutes", Number(e.target.value))}
            >
              {[5, 10, 15, 20, 30, 45, 60, 90, 120].map((v) => (
                <option value={v} key={v}>
                  {v} minutos
                </option>
              ))}
            </select>
          </div>
          <div className={s.formActions}>
            <button
              type="button"
              className="secondary press"
              disabled={busy}
              onClick={() => router.push("/exams")}
            >
              Cancelar
            </button>
            <button
              className="primary press"
              disabled={busy}
              aria-busy={busy || undefined}
            >
              {busy ? (
                <>
                  <Spinner /> Guardando…
                </>
              ) : (
                <>
                  Siguiente: materiales{" "}
                  <ArrowRight size={18} aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </form>
      )}
      {step === 1 && (
        <form
          className={s.form}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void next();
          }}
        >
          <h2>¿Qué entra en el examen?</h2>
          <div className={s.field}>
            <label htmlFor="exam-topics">Temas</label>
            <textarea
              id="exam-topics"
              aria-describedby={describe("topics", "exam-topics-help")}
              aria-invalid={!!invalid.topics || undefined}
              value={topics}
              onChange={(e) => {
                setTopics(e.target.value);
                if (invalid.topics)
                  setInvalid((x) => ({ ...x, topics: undefined }));
              }}
              placeholder={"Ecuaciones\nFactorización"}
              maxLength={5000}
            />
            <FieldError id="exam-topics-error">{invalid.topics}</FieldError>
            <p className={s.help} id="exam-topics-help">
              Uno por línea, hasta 30. También puedes separarlos con punto y
              coma.
            </p>
          </div>
          <div className={s.field}>
            <label htmlFor="exam-difficulties">
              ¿Qué te cuesta más? <span className={s.optional}>(opcional)</span>
            </label>
            <textarea
              id="exam-difficulties"
              value={fields.difficulties}
              onChange={(e) => change("difficulties", e.target.value)}
              maxLength={4000}
              placeholder="Cuéntale a Dream dónde te atascas"
            />
          </div>
          <div className={s.field}>
            <span className={s.fieldLabel}>
              Tus apuntes <span className={s.optional}>(opcional)</span>
            </span>
            <input
              ref={input}
              type="file"
              accept={fileAccept}
              multiple
              className="visually-hidden"
              tabIndex={-1}
              aria-label="Adjuntar materiales del examen"
              onChange={(e) => {
                void attach(Array.from(e.target.files || []));
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className={`${s.dropzone} press`}
              disabled={busy}
              onClick={() => input.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void attach(Array.from(e.dataTransfer.files));
              }}
            >
              <Upload size={24} aria-hidden="true" />
              <span>Añade tus apuntes</span>
              <small>
                PDF, Word, imágenes, PowerPoint o Excel. Hasta{" "}
                <span className="num">4</span> archivos de{" "}
                <span className="num">8</span> MB.
              </small>
            </button>
          </div>
          {storedMaterials.map((m) => (
            <div key={m.id}>
              <Materials materials={[m]} />
              <button
                type="button"
                className="text-button danger press"
                disabled={busy}
                onClick={() =>
                  void updateExam("exam_material_remove", examId.current, {
                    attachment_id: m.id,
                  })
                    .then(setExam)
                    .catch((e) => setError(errorMessage(e)))
                }
              >
                Quitar {m.file_name}
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
          {pending && (
            <p className={s.help} role="status">
              Espera a que terminen de subir tus apuntes.
            </p>
          )}
          <div className={s.formActions}>
            <button
              type="button"
              className="secondary press"
              disabled={busy}
              onClick={() => setStep(0)}
            >
              <ArrowLeft size={18} aria-hidden="true" /> Volver
            </button>
            <button
              className="primary press"
              disabled={busy || pending}
              aria-busy={busy || undefined}
            >
              {busy ? (
                <>
                  <Spinner /> Guardando…
                </>
              ) : (
                <>
                  Revisar mi examen <ArrowRight size={18} aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </form>
      )}
      {step === 2 && (
        <section className={s.form} aria-labelledby="exam-review">
          <h2 id="exam-review">{fields.title}</h2>
          <dl className={s.summary}>
            <div>
              <dt>Asignatura</dt>
              <dd>{fields.subject}</dd>
            </div>
            <div>
              <dt>Fecha</dt>
              <dd>{examDateLabel(fields.exam_date)}</dd>
            </div>
            <div>
              <dt>Temas</dt>
              <dd className={s.chips}>
                {values().topics.map((t, i) => (
                  <span className={s.chip} key={i}>
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
              <dt>Apuntes</dt>
              <dd>
                <Materials materials={exam?.materials || []} />
              </dd>
            </div>
          </dl>
          <p className={s.help}>
            Dream dividirá tus temas en unidades cortas, con una conversación
            para entender cada una. No resuelve el examen por ti.
          </p>
          <div className={s.formActions}>
            <button
              type="button"
              className="secondary press"
              disabled={busy}
              onClick={() => setStep(0)}
            >
              Editar datos
            </button>
            <button
              className="primary press"
              disabled={busy || pending}
              aria-busy={busy || undefined}
              onClick={() => void generate()}
            >
              Generar plan de estudio{" "}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        </section>
      )}
      {step === 3 &&
        (failed ? (
          <FailedState
            cause={error}
            onRetry={() => void generate()}
            retrying={busy}
            editHref={`/exams/new?id=${examId.current}`}
          />
        ) : (
          <PreparingState topics={values().topics} />
        ))}
      {!(step === 3 && failed) && <ErrorNotice error={error} />}
    </ExamPage>
  );
}
