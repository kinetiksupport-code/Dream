"use client";
// Repaso de tarjetas (prompt de la ruta, Bloque 4; Claude Design
// PantallaTarjetasMovil/Escritorio): pantalla completa con la X, la barra, el
// contador, UNA tarjeta que se gira y los 4 botones con el próximo intervalo.
// Repasar no usa IA y sigue sin conexión: las notas se guardan en una cola
// (solo ids, nota y hora) y se envían al volver. La programación que cuenta
// es la del servidor (FSRS-5); aquí solo se enseña el intervalo.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CloudOff } from "lucide-react";
import { errorMessage } from "@/lib/dream-api";
import { previewIntervals, schedule } from "@/lib/srs";
import { useOnline } from "@/lib/use-online";
import { cardsDue, enqueueReview, flushReviews, readQueue, type DueCard, type Rating } from "@/lib/study-api";
import { Markdown } from "../markdown";
import { StepFrame } from "../exams/step-frame";
import sf from "../exams/step-frame.module.css";
import s from "./cards.module.css";

const RATINGS: { rating: Rating; label: string }[] = [
  { rating: 1, label: "Otra vez" },
  { rating: 2, label: "Difícil" },
  { rating: 3, label: "Bien" },
  { rating: 4, label: "Fácil" },
];

export function CardReview({ back = "/exams" }: { back?: string }) {
  const router = useRouter();
  const online = useOnline();
  const [cards, setCards] = useState<DueCard[] | null>(null);
  const [error, setError] = useState("");
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tomorrow, setTomorrow] = useState(0);
  const started = useRef(Date.now());
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    // Primero lo que quedó pendiente de otra vez; después, lo que toca hoy.
    void flushReviews()
      .catch(() => 0)
      .then(() => cardsDue())
      .then((r) => {
        if (!alive) return;
        // Lo que ya se repasó sin conexión no se vuelve a enseñar.
        const pending = new Set(readQueue().map((q) => q.card_id));
        setCards(r.cards.filter((c) => !pending.has(c.id)));
        started.current = Date.now();
      })
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, []);
  // Al volver la conexión, se envía la cola.
  useEffect(() => {
    if (online) void flushReviews().catch(() => undefined);
  }, [online]);

  const card = cards?.[i];
  const rate = useCallback(
    (rating: Rating) => {
      if (!card || !flipped || busy.current) return;
      busy.current = true;
      const now = new Date();
      const next = schedule(card, rating, now);
      // «3 para mañana»: las que vuelven el día siguiente (hora local).
      const start = new Date(now);
      start.setHours(24, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const due = new Date(next.due);
      if (due >= start && due < end) setTomorrow((t) => t + 1);
      enqueueReview({ review_id: crypto.randomUUID(), card_id: card.id, rating, reviewed_at: now.toISOString() });
      if (navigator.onLine) void flushReviews().catch(() => undefined);
      setFlipped(false);
      setI((n) => n + 1);
      busy.current = false;
    },
    [card, flipped],
  );

  // Escritorio: Espacio gira; 1-4 puntúan (decisión de Claude Design).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === " " && card) {
        // Espacio sobre un botón ya lo pulsa: solo se gira desde fuera de ellos.
        if (t?.tagName === "BUTTON" && t.dataset.card === undefined) return;
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key) as Rating);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, rate]);

  if (error)
    return (
      <div className={sf.frame}>
        <main className={s.end}>
          <h1 className={s.endTitle}>No hemos podido traer tus tarjetas</h1>
          <p className={s.endText}>{error}</p>
        </main>
        <footer className={sf.foot}>
          <Link className="primary press" href={back}>
            Volver
          </Link>
        </footer>
      </div>
    );
  if (!cards)
    return (
      <div className={sf.frame} aria-busy="true">
        <p className="visually-hidden" role="status">
          Cargando tus tarjetas
        </p>
      </div>
    );

  if (!card) {
    const done = cards.length;
    const minutes = Math.max(1, Math.round((Date.now() - started.current) / 60000));
    return (
      <div className={sf.frame} data-testid="tarjetas-fin">
        <main className={s.end}>
          <span className={s.endIcon} aria-hidden="true">
            <Check size={28} />
          </span>
          <h1 className={s.endTitle}>{done ? "Repaso de hoy hecho" : "Hoy no tienes tarjetas"}</h1>
          <p className={s.endText}>
            {done
              ? `${done} ${done === 1 ? "repasada" : "repasadas"} en ${minutes} min · ${tomorrow} para mañana.`
              : "Cuando termines una lección, sus tarjetas aparecerán aquí."}
          </p>
          {!online && <p className={s.offline}>Sin conexión. Lo enviamos al volver.</p>}
        </main>
        <footer className={sf.foot}>
          <Link className="primary press" href={back}>
            Volver
          </Link>
        </footer>
      </div>
    );
  }

  const intervals = previewIntervals(card, new Date());
  return (
    <StepFrame
      label="Repaso"
      position={i + 1}
      total={cards.length}
      remaining={null}
      onExit={() => router.push(back)}
      footer={
        flipped ? (
          <div className={s.ratings} role="group" aria-label="¿Cómo te ha ido?">
            {RATINGS.map((r) => (
              <button key={r.rating} type="button" className={`secondary press ${s.rating}`} data-rating={r.rating} onClick={() => rate(r.rating)}>
                <span>{r.label}</span>
                <small className="num">{intervals[r.rating - 1].label}</small>
              </button>
            ))}
          </div>
        ) : (
          <span className={s.hint}>Toca la tarjeta para girarla</span>
        )
      }
    >
      {!online && (
        <p className={s.offline} role="status">
          <CloudOff size={16} aria-hidden="true" /> Sin conexión. Sigue repasando: lo guardamos y se envía al volver.
        </p>
      )}
      <button
        type="button"
        className={s.card}
        data-card=""
        data-flipped={flipped || undefined}
        aria-label={flipped ? "Respuesta. Pulsa para ver la pregunta" : "Pregunta. Pulsa para ver la respuesta"}
        onClick={() => setFlipped((f) => !f)}
        key={card.id}
      >
        <span className={s.face} aria-hidden={flipped || undefined}>
          <span className={s.label}>Pregunta</span>
          <span className={s.main}>
            <Markdown content={card.front} />
          </span>
          <span className={s.tap}>Toca para girar</span>
        </span>
        <span className={`${s.face} ${s.back}`} aria-hidden={!flipped || undefined}>
          <span className={`${s.label} ${s.answer}`}>Respuesta</span>
          <span className={s.main}>
            <Markdown content={card.back} />
          </span>
        </span>
      </button>
    </StepFrame>
  );
}
