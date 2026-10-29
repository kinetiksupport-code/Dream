"use client";
// Ajustes › Perfil › Cómo estudias (P4, docs/HABLA_NATURAL.md): curso,
// asignaturas que cuestan, comunidad, objetivo, cómo prefiere que le
// expliquen y tiempo de estudio. Todo opcional y de listas cerradas: Dream lo
// usa para adaptar las explicaciones, sin nada que identifique al alumno.
// Solo aparece cuando dream-api envía study_profile (con su migración).
import { useId, useState, type FormEvent } from "react";
import { Modal } from "../modal";
import { CheckIcon } from "../icons";
import { useDream } from "../providers";
import { errorMessage, saveOnboarding } from "@/lib/dream-api";
import { MAX_HARD_SUBJECTS, STUDY, type StudyProfile } from "@/lib/onboarding";
import s from "./welcome.module.css";

const EXIT_MS = 120;
const NONE = "";

/** One labelled select with «Sin elegir». */
function Pick({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <>
      <label className={s.label} htmlFor={id}>
        {label}
      </label>
      <select id={id} className={s.input} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value={NONE}>Sin elegir</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </>
  );
}

export function StudySettings() {
  const { profile, refreshProfile } = useDream();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [level, setLevel] = useState(NONE);
  const [study, setStudy] = useState<StudyProfile>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!profile || profile.study_profile === undefined) return null;

  const saved = profile.study_profile;
  const hard = study.hard ?? [];
  const full = hard.length >= MAX_HARD_SUBJECTS;
  const summary = [
    profile.academic_level,
    saved.hard?.length ? `le cuesta ${saved.hard.join(", ")}` : null,
    saved.goal,
  ].filter(Boolean);

  function edit() {
    setLevel(
      profile?.academic_level && (STUDY.level as readonly string[]).includes(profile.academic_level)
        ? profile.academic_level
        : NONE,
    );
    setStudy({ ...saved, hard: [...(saved.hard ?? [])] });
    setError("");
    setLeaving(false);
    setOpen(true);
  }
  function close() {
    setLeaving(true);
    window.setTimeout(() => {
      setOpen(false);
      setLeaving(false);
    }, EXIT_MS);
  }
  const set = (key: keyof Omit<StudyProfile, "hard">) => (value: string) =>
    setStudy((x) => ({ ...x, [key]: value || undefined }));
  function toggle(subject: string) {
    setStudy((x) => {
      const list = x.hard ?? [];
      return { ...x, hard: list.includes(subject) ? list.filter((h) => h !== subject) : [...list, subject] };
    });
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await saveOnboarding({ academic_level: level || null, study_profile: study });
      await refreshProfile();
      close();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <dl className="group-list">
        <div className="group-row">
          <dt>Cómo estudias</dt>
          <dd className={`value ${s.interestsValue}`}>{summary.length ? summary.join(" · ") : "Sin rellenar"}</dd>
        </div>
      </dl>
      <div className="button-row">
        <button type="button" className="secondary press" onClick={edit}>
          Cambiar cómo estudias
        </button>
      </div>
      {open && (
        <Modal labelledBy={`${id}-title`} onClose={close} leaving={leaving}>
          <h2 id={`${id}-title`}>Cómo estudias</h2>
          <p className="muted">Todo es opcional. Dream lo usa para explicarte a tu medida, sin nada que te identifique.</p>
          <form className={`${s.editForm} ${s.plain}`} onSubmit={(e) => void save(e)} noValidate>
            <Pick id={`${id}-level`} label="Curso" value={level} options={STUDY.level} onChange={setLevel} />
            <p className={s.label} id={`${id}-hard`}>
              Lo que más te cuesta{" "}
              <span className="num">
                ({hard.length} de {MAX_HARD_SUBJECTS})
              </span>
            </p>
            <div className={s.chips} role="group" aria-labelledby={`${id}-hard`}>
              {STUDY.hard.map((subject) => {
                const on = hard.includes(subject);
                return (
                  <button
                    key={subject}
                    type="button"
                    className={`${s.chip} press`}
                    aria-pressed={on}
                    disabled={!on && full}
                    onClick={() => toggle(subject)}
                  >
                    {subject}
                    <span className={s.chipTick} aria-hidden="true">
                      <CheckIcon size={14} />
                    </span>
                  </button>
                );
              })}
            </div>
            <Pick id={`${id}-goal`} label="Tu objetivo" value={study.goal ?? NONE} options={STUDY.goal} onChange={set("goal")} />
            <Pick id={`${id}-style`} label="Cómo prefieres que te expliquen" value={study.style ?? NONE} options={STUDY.style} onChange={set("style")} />
            <Pick id={`${id}-time`} label="Cuánto estudias al día" value={study.time ?? NONE} options={STUDY.time} onChange={set("time")} />
            <Pick id={`${id}-region`} label="Comunidad autónoma (por el temario)" value={study.region ?? NONE} options={STUDY.region} onChange={set("region")} />
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="secondary press" onClick={close}>
                Cancelar
              </button>
              <button className="primary press" disabled={busy} aria-busy={busy || undefined}>
                {busy ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
