"use client";
// Bienvenida para usuarios nuevos (prompt «landing, login y bienvenida» §4.2).
// Mismo lenguaje que el asistente de crear examen: pantalla completa sin menú,
// una pregunta por pantalla, flecha atrás arriba a la izquierda, barra de
// progreso, el orbe acompañando y recompensa al final. Reutiliza el marco y
// los fondos del asistente (wizard.module.css) y sus transiciones de paso
// (globals.css › .wizard-step).
//
// Pasos: Hola → nombre → aficiones → apodo → edad → «Vas a hablar con una IA»
// → «¡Listo, {apodo}!». Cada paso guarda su avance en dream-api
// (onboarding_save): al recargar se vuelve donde iba. La fecha de nacimiento
// no se guarda hasta el consentimiento; menores de 14: pantalla de despedida,
// el servidor borra lo guardado y se cierra la sesión.
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChefHat,
  Clapperboard,
  CloudOff,
  Cpu,
  Footprints,
  Gamepad2,
  Goal,
  Music,
  Palette,
  PawPrint,
  Plane,
  Plus,
  Shirt,
  Sparkles,
  Trees,
  Volleyball,
  type LucideIcon,
} from "lucide-react";
import { Orb } from "../orb";
import { Sticker } from "../sticker";
import { AlertIcon, CheckIcon } from "../icons";
import { useDream } from "../providers";
import { checkAge, errorMessage, saveConsent, saveOnboarding } from "@/lib/dream-api";
import { useOnline } from "@/lib/use-online";
import {
  AI_DISCLOSURE,
  CONSENT_FIELDS,
  CONSENT_TEXT,
  MIN_AGE,
  TERMS_VERSION,
  isoDate,
  validateConsent,
  type ConsentErrors,
  type ConsentField,
} from "@/lib/consent";
import {
  INTERESTS,
  LIMITS,
  WELCOME_STEPS,
  addInterest,
  birthCheck,
  birthFromIso,
  birthIso,
  birthLabel,
  clean,
  initialBirth,
  nameError,
  nicknameFor,
  nicknameSuggestions,
  resumeStep,
  stepIndex,
  toggleInterest,
  type BirthParts,
  type WelcomeStep,
} from "@/lib/onboarding";
import { BirthWheel } from "./birth-wheel";
import w from "../exams/wizard/wizard.module.css";
import s from "./welcome.module.css";

const ICONS: Record<(typeof INTERESTS)[number], LucideIcon> = {
  Fútbol: Goal,
  Baloncesto: Volleyball,
  Música: Music,
  Videojuegos: Gamepad2,
  Dibujo: Palette,
  Leer: BookOpen,
  "Series y pelis": Clapperboard,
  Baile: Footprints,
  Cocina: ChefHat,
  Animales: PawPrint,
  Tecnología: Cpu,
  Moda: Shirt,
  Viajar: Plane,
  Naturaleza: Trees,
};
const SPARKS = [
  [-74, -36],
  [66, -50],
  [-50, -88],
  [42, -98],
  [-98, -4],
  [94, -12],
];
const ORDER: WelcomeStep[] = [...WELCOME_STEPS.map((x) => x.key), "listo"];

function StepTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h1 id={id} className={`hero-title ${w.stepTitle}`} tabIndex={-1} data-step-title>
      {children}
    </h1>
  );
}

function Continue({
  children = "Continuar",
  busy,
  disabled,
  tone = "yellow",
  onClick,
  type = "button",
  form,
}: {
  children?: ReactNode;
  busy?: boolean;
  disabled?: boolean;
  tone?: "yellow" | "blue";
  onClick?: () => void;
  type?: "button" | "submit";
  form?: string;
}) {
  return (
    <button
      type={type}
      form={form}
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

export function WelcomeFlow({ gate }: { gate: "welcome" | "consent" }) {
  const { profile, refreshProfile, logout } = useDream();
  const online = useOnline();
  const id = useId();
  const first = gate === "consent" ? resumeStep(profile, gate) : "hola";
  const [step, setStep] = useState<WelcomeStep>(() => resumeStep(profile, gate));
  const [enter, setEnter] = useState<"forward" | "back" | "fade">("fade");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);

  const [name, setName] = useState(() => clean(profile?.display_name ?? "", LIMITS.name));
  const [nameTried, setNameTried] = useState(false);
  const [interests, setInterests] = useState<string[]>(() => profile?.interests ?? []);
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState("");
  const [nickname, setNickname] = useState(() => profile?.nickname ?? "");
  const [birth, setBirth] = useState<BirthParts>(() => initialBirth());
  const [birthTouched, setBirthTouched] = useState(false);
  const [birthTried, setBirthTried] = useState(false);
  const [typing, setTyping] = useState(false);
  const [checks, setChecks] = useState({ ai: false, terms: false });
  const [consentErrors, setConsentErrors] = useState<ConsentErrors>({});
  const [consentTried, setConsentTried] = useState(false);
  const customInput = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  const birthDate = birthIso(birth);
  const birthProblem = birthTried ? birthCheck(birthDate, birthTouched) : null;
  const shownName = nicknameFor(nickname, name);

  // Focus goes to the new step's title (the live region reads «Paso N»).
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setError("");
    document.querySelector<HTMLElement>("[data-step-title]")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [step]);

  useEffect(() => {
    if (adding) customInput.current?.focus();
  }, [adding]);

  function go(next: WelcomeStep) {
    setEnter(ORDER.indexOf(next) < ORDER.indexOf(step) ? "back" : "forward");
    setStep(next);
  }

  /** One action at a time (double taps do nothing); errors stay on screen. */
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

  const back = () => {
    const i = ORDER.indexOf(step);
    if (i > 0) go(ORDER[i - 1]);
  };

  const toName = () =>
    run(async () => {
      await saveOnboarding({ step: 1 });
      go("nombre");
    });
  const toInterests = (e?: FormEvent) => {
    e?.preventDefault();
    setNameTried(true);
    if (nameError(name)) {
      document.getElementById(`${id}-name`)?.focus();
      return;
    }
    void run(async () => {
      const display_name = clean(name, LIMITS.name);
      await saveOnboarding({ step: 2, display_name });
      setName(display_name);
      go("gustos");
    });
  };
  const toNickname = () =>
    run(async () => {
      await saveOnboarding({ step: 3, interests });
      go("apodo");
    });
  const toAge = (e?: FormEvent) => {
    e?.preventDefault();
    void run(async () => {
      const value = nicknameFor(nickname, name);
      await saveOnboarding({ step: 4, nickname: value });
      setNickname(value);
      go("edad");
    });
  };
  const toConsent = () => {
    setBirthTried(true);
    const problem = birthCheck(birthDate, birthTouched);
    if (problem && "error" in problem) {
      document.getElementById(`${id}-birth`)?.focus();
      return;
    }
    void run(async () => {
      // The server checks too: under 14 it erases the welcome data.
      const minor = problem !== null;
      const { allowed } = await checkAge(birthDate).catch((e) => {
        if (minor) return { allowed: false };
        throw e;
      });
      go(minor || !allowed ? "menor" : "ia");
    });
  };
  function toggleCheck(field: ConsentField, value: boolean) {
    const next = { ...checks, [field]: value };
    setChecks(next);
    if (consentTried) setConsentErrors(validateConsent(next));
  }
  const toReady = (e: FormEvent) => {
    e.preventDefault();
    setConsentTried(true);
    const found = validateConsent(checks);
    setConsentErrors(found);
    const missing = CONSENT_FIELDS.find((f) => found[f]);
    if (missing) {
      document.getElementById(`${id}-${missing}`)?.focus();
      return;
    }
    void run(async () => {
      await saveConsent({
        ...(birthTouched ? { birth_date: birthDate } : {}),
        ai_consent: true,
        terms_accepted: true,
        terms_version: TERMS_VERSION,
      });
      go("listo");
    });
  };
  function addCustom(e?: FormEvent) {
    e?.preventDefault();
    const next = addInterest(interests, custom);
    if (next.length > interests.length) {
      setInterests(next);
      setCustom("");
      setAdding(false);
      requestAnimationFrame(() => addButton.current?.focus());
    }
  }

  const index = stepIndex(step);
  const total = WELCOME_STEPS.length;
  const done = step === "listo";
  const progress = done ? 1 : step === "menor" ? 0 : (index + 1) / total;
  const tone = done ? "yellow" : step === "edad" ? "warm" : "blue";
  const label = done ? "Listo" : step === "menor" ? "" : WELCOME_STEPS[index]?.label;
  const showBack = !done && step !== "menor" && step !== first;
  const full = interests.length >= LIMITS.interests;
  const customs = interests.filter((x) => !(INTERESTS as readonly string[]).includes(x));

  let content: ReactNode = null;
  let footer: ReactNode = null;

  if (step === "hola") {
    content = (
      <div className={`${w.welcome} stagger`}>
        <span className={s.mascot} aria-hidden="true">
          <Sticker shape="round" tone="yellow" size={148} tilt={-6}>
            <Orb size={92} breathing reaction="success" reactionKey="hola" />
          </Sticker>
        </span>
        <StepTitle>
          ¡Hola! Soy <span className="marker marker-draw">Dream</span>
        </StepTitle>
        <p className={w.lead}>Vamos a conocerte un poco. Son seis pasos cortos.</p>
      </div>
    );
    footer = (
      <Continue onClick={() => void toName()} busy={busy} disabled={!online}>
        Empezar
      </Continue>
    );
  } else if (step === "nombre") {
    const problem = nameTried ? nameError(name) : null;
    content = (
      <form id={`${id}-form`} className={s.form} onSubmit={toInterests} noValidate>
        <StepTitle>
          ¿Cómo te <span className="marker">llamas</span>?
        </StepTitle>
        <label className="visually-hidden" htmlFor={`${id}-name`}>
          Tu nombre
        </label>
        <input
          id={`${id}-name`}
          className={s.bigInput}
          value={name}
          maxLength={LIMITS.name}
          autoComplete="given-name"
          autoCapitalize="words"
          enterKeyHint="next"
          placeholder="Tu nombre"
          onChange={(e) => setName(e.target.value)}
          aria-invalid={problem ? true : undefined}
          aria-describedby={`${id}-name-hint${problem ? ` ${id}-name-error` : ""}`}
        />
        <p className={s.hint} id={`${id}-name-hint`}>
          Así aparecerá en Dream. Puedes cambiarlo en Ajustes.
        </p>
        {problem && (
          <p className={s.inlineError} id={`${id}-name-error`}>
            <AlertIcon size={18} />
            <span>{problem}</span>
          </p>
        )}
      </form>
    );
    footer = <Continue type="submit" form={`${id}-form`} busy={busy} disabled={!online} />;
  } else if (step === "gustos") {
    content = (
      <>
        <StepTitle id={`${id}-likes`}>
          ¿Qué te <span className="marker">gusta</span>?
        </StepTitle>
        <p className={w.lead} id={`${id}-likes-hint`}>
          Lo usaré para ponerte ejemplos que te suenen. Elige hasta {LIMITS.interests}.
        </p>
        <div
          className={s.chips}
          role="group"
          aria-labelledby={`${id}-likes`}
          aria-describedby={`${id}-likes-hint ${id}-likes-count`}
        >
          {INTERESTS.map((item) => {
            const Icon = ICONS[item];
            const on = interests.includes(item);
            return (
              <button
                key={item}
                type="button"
                className={`${s.chip} press`}
                aria-pressed={on}
                disabled={!on && full}
                onClick={() => setInterests(toggleInterest(interests, item))}
              >
                <Icon size={18} aria-hidden="true" />
                {item}
                <span className={s.chipTick} aria-hidden="true">
                  <CheckIcon size={14} />
                </span>
              </button>
            );
          })}
          {customs.map((item) => (
            <button
              key={item}
              type="button"
              className={`${s.chip} press`}
              aria-pressed="true"
              onClick={() => setInterests(toggleInterest(interests, item))}
            >
              <Sparkles size={18} aria-hidden="true" />
              {item}
              <span className={s.chipTick} aria-hidden="true">
                <CheckIcon size={14} />
              </span>
            </button>
          ))}
          {!adding && (
            <button
              ref={addButton}
              type="button"
              className={`${s.chip} ${s.chipAdd} press`}
              disabled={full}
              onClick={() => setAdding(true)}
            >
              <Plus size={18} aria-hidden="true" />
              Añadir otra
            </button>
          )}
        </div>
        {adding && (
          <form className={s.addForm} onSubmit={addCustom}>
            <label className="visually-hidden" htmlFor={`${id}-custom`}>
              Otra cosa que te guste
            </label>
            <input
              ref={customInput}
              id={`${id}-custom`}
              className={s.input}
              value={custom}
              maxLength={LIMITS.interest}
              placeholder="Por ejemplo: ajedrez"
              enterKeyHint="done"
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setAdding(false);
                  setCustom("");
                }
              }}
            />
            <button type="submit" className="secondary press" disabled={!clean(custom, LIMITS.interest)}>
              Añadir
            </button>
          </form>
        )}
        <p className={w.footerNote} id={`${id}-likes-count`} aria-live="polite">
          {full
            ? `Ya tienes ${LIMITS.interests}. Quita una para elegir otra.`
            : `${interests.length} de ${LIMITS.interests}`}
        </p>
      </>
    );
    footer = (
      <Continue onClick={() => void toNickname()} busy={busy} disabled={!online}>
        {interests.length ? "Continuar" : "Saltar"}
      </Continue>
    );
  } else if (step === "apodo") {
    const suggestions = nicknameSuggestions(name);
    content = (
      <form id={`${id}-form`} className={s.form} onSubmit={toAge} noValidate>
        <StepTitle>
          ¿Cómo quieres que te <span className="marker">llame</span> la IA?
        </StepTitle>
        {suggestions.length > 0 && (
          <div className={s.chips} role="group" aria-label="Sugerencias">
            {suggestions.map((item) => (
              <button
                key={item}
                type="button"
                className={`${s.chip} press`}
                aria-pressed={clean(nickname, LIMITS.nickname) === item}
                onClick={() => setNickname(item)}
              >
                {item}
                <span className={s.chipTick} aria-hidden="true">
                  <CheckIcon size={14} />
                </span>
              </button>
            ))}
          </div>
        )}
        <label className={s.label} htmlFor={`${id}-nick`}>
          U otro nombre
        </label>
        <input
          id={`${id}-nick`}
          className={s.input}
          value={nickname}
          maxLength={LIMITS.nickname}
          autoComplete="nickname"
          enterKeyHint="next"
          placeholder={suggestions[0] ?? ""}
          onChange={(e) => setNickname(e.target.value)}
          aria-describedby={`${id}-nick-hint`}
        />
        <p className={s.hint} id={`${id}-nick-hint`}>
          {clean(nickname, LIMITS.nickname)
            ? `Hasta ${LIMITS.nickname} letras.`
            : `Si lo dejas vacío, te llamaré ${suggestions[0] ?? "por tu nombre"}.`}
        </p>
      </form>
    );
    footer = <Continue type="submit" form={`${id}-form`} busy={busy} disabled={!online} tone="yellow" />;
  } else if (step === "edad") {
    const minor = birthProblem && "minor" in birthProblem;
    const problem = birthProblem && "error" in birthProblem ? birthProblem.error : null;
    content = (
      <>
        <StepTitle>
          ¿Cuántos <span className="marker">años</span> tienes?
        </StepTitle>
        <p className={w.lead} id={`${id}-birth-hint`}>
          Sirve para saber si puedes usar Dream. No la usamos para nada más.
        </p>
        <p className={s.birthValue} aria-hidden="true">
          {birthTouched ? birthLabel(birth) : "Tu fecha de nacimiento"}
        </p>
        {typing ? (
          <div className={s.form}>
            <label className={s.label} htmlFor={`${id}-birth`}>
              Fecha de nacimiento
            </label>
            <input
              id={`${id}-birth`}
              type="date"
              className={s.input}
              min="1900-01-01"
              max={isoDate(new Date())}
              autoComplete="bday"
              value={birthTouched ? birthDate : ""}
              onChange={(e) => {
                const parts = birthFromIso(e.target.value);
                if (!parts) return;
                setBirth(parts);
                setBirthTouched(true);
              }}
              aria-invalid={problem ? true : undefined}
              aria-describedby={`${id}-birth-hint${problem ? ` ${id}-birth-error` : ""}`}
            />
          </div>
        ) : (
          <div id={`${id}-birth`} tabIndex={-1} className={s.wheelWrap} aria-describedby={`${id}-birth-hint`}>
            <BirthWheel
              value={birth}
              onChange={(v) => {
                setBirth(v);
                setBirthTouched(true);
              }}
            />
          </div>
        )}
        {problem && (
          <p className={s.inlineError} id={`${id}-birth-error`} role="alert">
            <AlertIcon size={18} />
            <span>{problem}</span>
          </p>
        )}
        {minor && (
          <p className={s.hint} role="status">
            Dream es para mayores de {MIN_AGE} años.
          </p>
        )}
        <button type="button" className={`text-button press ${s.switchInput}`} onClick={() => setTyping(!typing)}>
          {typing ? "Usar las ruedas" : "Escribir la fecha"}
        </button>
      </>
    );
    footer = <Continue onClick={toConsent} busy={busy} disabled={!online} tone="blue" />;
  } else if (step === "ia") {
    const option = (field: ConsentField, text: ReactNode, hint?: string) => (
      <div className={s.optionWrap}>
        <label className={`press ${s.option}`} data-invalid={consentErrors[field] ? "true" : undefined}>
          <span className={s.control}>
            <input
              id={`${id}-${field}`}
              type="checkbox"
              checked={checks[field]}
              onChange={(e) => toggleCheck(field, e.target.checked)}
              aria-invalid={consentErrors[field] ? true : undefined}
              aria-describedby={
                [hint, consentErrors[field] ? `${id}-${field}-error` : ""].filter(Boolean).join(" ") || undefined
              }
            />
            <span className={s.box} aria-hidden="true">
              <CheckIcon size={16} />
            </span>
          </span>
          <span className={s.optionText}>{text}</span>
        </label>
        {consentErrors[field] && (
          <p className={s.inlineError} id={`${id}-${field}-error`}>
            <AlertIcon size={18} />
            <span>{consentErrors[field]}</span>
          </p>
        )}
      </div>
    );
    content = (
      <form id={`${id}-form`} className={s.consent} onSubmit={toReady} noValidate>
        <span className={s.consentOrb} aria-hidden="true">
          <Orb size={56} breathing />
        </span>
        <StepTitle>
          Vas a hablar con una <span className="marker">IA</span>
        </StepTitle>
        <p className={s.disclosure}>{AI_DISCLOSURE}</p>
        <fieldset className={s.options}>
          <legend className="visually-hidden">Para usar Dream</legend>
          {option("ai", CONSENT_TEXT.ai)}
          {option(
            "terms",
            <>
              He leído y acepto los{" "}
              <Link href="/terminos" target="_blank" rel="noopener">
                Términos
              </Link>{" "}
              y la{" "}
              <Link href="/privacidad" target="_blank" rel="noopener">
                Política de privacidad
              </Link>
            </>,
            `${id}-links`,
          )}
        </fieldset>
        <p className={s.hint} id={`${id}-links`}>
          Los enlaces se abren en otra pestaña.
        </p>
      </form>
    );
    footer = (
      <Continue type="submit" form={`${id}-form`} busy={busy} disabled={!online}>
        Aceptar y seguir
      </Continue>
    );
  } else if (step === "listo") {
    content = (
      <div className={w.welcome}>
        <div className={`${w.celebrate} ${s.celebrate}`} aria-hidden="true">
          {SPARKS.map(([dx, dy], i) => (
            <span
              key={i}
              className={w.spark}
              style={{
                ["--dx" as string]: `${dx}px`,
                ["--dy" as string]: `${dy}px`,
                left: "50%",
                top: "50%",
                animationDelay: `${160 + i * 30}ms`,
              }}
            />
          ))}
          <span className={s.drop}>
            <Sticker shape="scalloped" tone="blue" size={150} tilt={-8}>
              <Orb size={84} breathing reaction="success" reactionKey="listo" />
            </Sticker>
          </span>
        </div>
        <StepTitle>
          ¡Listo, <span className="marker marker-draw">{shownName || "ya estás"}</span>!
        </StepTitle>
        <p className={w.lead}>Ya puedes estudiar con Dream.</p>
      </div>
    );
    footer = (
      <Continue tone="blue" busy={busy} onClick={() => void run(refreshProfile)}>
        Ir a Dream
      </Continue>
    );
  } else if (step === "menor") {
    content = (
      <div className={w.welcome}>
        <span className={s.mascot} aria-hidden="true">
          <Sticker shape="round" tone="yellow" size={132} tilt={6}>
            <Orb size={80} breathing />
          </Sticker>
        </span>
        <StepTitle>
          Dream es para mayores de {MIN_AGE} <span className="marker">años</span>.
        </StepTitle>
        <p className={w.lead}>¡Te esperamos! No hemos guardado tus datos.</p>
      </div>
    );
    footer = (
      <Continue tone="yellow" busy={busy} onClick={() => void run(logout)}>
        Salir
      </Continue>
    );
  }

  return (
    <main className={s.page}>
      <div className={w.frame} data-tone={tone}>
        <div className={w.bg} aria-hidden="true">
          <span className={w.bgBlue} />
          <span className={w.bgGrid} />
          <span className={w.bgWarm} />
          <span className={w.bgWarmHot} />
          <span className={w.bgYellow} />
        </div>
        <div className={w.top}>
          {showBack ? (
            <button type="button" className={`${w.backButton} press`} aria-label="Paso anterior" onClick={back}>
              <ArrowLeft size={22} aria-hidden="true" />
            </button>
          ) : (
            <span />
          )}
          {step === "menor" ? (
            <span />
          ) : (
            <span
              className={w.progress}
              role="progressbar"
              aria-label="Progreso de la bienvenida"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done ? total : index + 1}
            >
              <i style={{ transform: `scaleX(${Math.max(0.04, progress)})` }} />
            </span>
          )}
          {done || step === "menor" ? (
            <span />
          ) : (
            <button
              type="button"
              className={`${s.exit} press`}
              onClick={() => void logout().catch((e) => setError(errorMessage(e)))}
            >
              Salir
            </button>
          )}
        </div>
        <p className="visually-hidden" aria-live="polite">
          {done ? "¡Listo!" : label ? `Paso ${index + 1} de ${total}: ${label}` : ""}
        </p>
        <div className="wizard-step" key={step} data-enter={enter}>
          <div className={w.body}>
            {!online && (
              <p className={w.offline} role="status">
                <CloudOff size={18} aria-hidden="true" />
                Sin conexión. Lo que ya has hecho está guardado; sigue cuando vuelva.
              </p>
            )}
            {content}
            {error && (
              <p className={s.saveError} role="alert">
                <AlertIcon size={18} />
                <span>{error}</span>
              </p>
            )}
          </div>
          {footer && <div className={w.footer}>{footer}</div>}
        </div>
      </div>
    </main>
  );
}
