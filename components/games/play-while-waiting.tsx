"use client";
// «Juega mientras esperas» (prompt de la ruta, 0.10; decidido por Carlos el
// 22-oct). Solo en esperas largas (> 5 s), siempre opcional y nunca arranca
// solo. Cinco juegos propios (Torre, Snake, Pong, Koi y Revienta el orbe) que
// se descargan solo al pulsarlos; récord en el dispositivo, sin servidor, sin
// ranking, sin sonido y sin vidas. Cuando la espera acaba, no saca al alumno de
// la partida: aparece «Tu lección está lista · Empezar».
import { useEffect, useRef, useState } from "react";
import { Gamepad2, Pause, Play, RotateCcw } from "lucide-react";
import type { GameApi, GameSpec } from "./engine";
import s from "./games.module.css";

export const GAMES = [
  { id: "torre", name: "Torre", how: "Suelta cada bloque justo encima del anterior. Espacio o toque." },
  { id: "snake", name: "Snake", how: "Come estrellas sin chocarte contigo. Flechas o toca hacia dónde girar." },
  { id: "pong", name: "Pong", how: "Contra Orb. Flechas arriba y abajo, o arrastra." },
  { id: "koi", name: "Koi", how: "Toca el agua y los peces vienen a comer. Flechas y Espacio." },
  { id: "orbes", name: "Revienta el orbe", how: "Revienta los orbes antes de que lleguen arriba. Toca, o flechas y Espacio." },
] as const;
type GameId = (typeof GAMES)[number]["id"];

// Un archivo por juego: solo se descarga el que se abre.
const LOADERS: Record<GameId, () => Promise<{ default: GameSpec<unknown> }>> = {
  torre: () => import("./torre") as Promise<{ default: GameSpec<unknown> }>,
  snake: () => import("./snake") as Promise<{ default: GameSpec<unknown> }>,
  pong: () => import("./pong") as Promise<{ default: GameSpec<unknown> }>,
  koi: () => import("./koi") as Promise<{ default: GameSpec<unknown> }>,
  orbes: () => import("./orbes") as Promise<{ default: GameSpec<unknown> }>,
};

/** Solo se ofrece si se espera más de 5 s (0.10). */
export const PLAY_MIN_WAIT_MS = 5000;

export function PlayWhileWaiting({
  expectedMs,
  ready,
  readyText = "Tu lección está lista",
  startText = "Empezar",
  onStart,
  onOpenChange,
}: {
  /** Mientras se juega, quien espera no cambia de pantalla aunque acabe la espera. */
  onOpenChange?: (open: boolean) => void;
  /** Espera prevista; con menos de 5 s no se ofrece. */
  expectedMs: number;
  /** La espera ha terminado. */
  ready: boolean;
  readyText?: string;
  startText?: string;
  onStart: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (expectedMs < PLAY_MIN_WAIT_MS) return null;
  if (!open)
    return ready ? null : (
      <button
        type="button"
        className={`secondary press ${s.offer}`}
        onClick={() => {
          setOpen(true);
          onOpenChange?.(true);
        }}
      >
        <Gamepad2 size={18} aria-hidden="true" /> Juega mientras esperas
      </button>
    );
  return (
    <Arcade
      ready={ready}
      readyText={readyText}
      startText={startText}
      onStart={onStart}
      onClose={() => {
        setOpen(false);
        onOpenChange?.(false);
      }}
    />
  );
}

function Arcade({
  ready,
  readyText,
  startText,
  onStart,
  onClose,
}: {
  ready: boolean;
  readyText: string;
  startText: string;
  onStart: () => void;
  onClose: () => void;
}) {
  const [game, setGame] = useState<GameId>("torre");
  const [score, setScore] = useState(0);
  const [record, setRecord] = useState(0);
  const [over, setOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const api = useRef<GameApi | null>(null);
  const meta = GAMES.find((g) => g.id === game)!;

  useEffect(() => {
    let alive = true;
    setScore(0);
    setOver(false);
    setPaused(false);
    void Promise.all([LOADERS[game](), import("./engine")]).then(([mod, engine]) => {
      if (!alive || !canvas.current) return;
      setRecord(engine.readRecord(game));
      api.current = engine.runGame(canvas.current, mod.default, {
        onScore: setScore,
        onOver: (n) => {
          engine.saveRecord(game, n);
          setRecord(engine.readRecord(game));
          setOver(true);
        },
      });
      canvas.current.focus();
    });
    // Se pausa al perder el foco (también lo hace el motor con blur y pestaña oculta).
    const onBlur = () => setPaused(true);
    window.addEventListener("blur", onBlur);
    return () => {
      alive = false;
      window.removeEventListener("blur", onBlur);
      api.current?.destroy();
      api.current = null;
    };
  }, [game]);

  function togglePause() {
    if (paused) api.current?.resume();
    else api.current?.pause();
    setPaused(!paused);
    canvas.current?.focus();
  }
  function again() {
    api.current?.restart();
    setOver(false);
    setPaused(false);
    canvas.current?.focus();
  }

  return (
    <section className={s.arcade} aria-label="Juega mientras esperas" data-testid="arcade">
      {ready && (
        <div className={s.ready} role="status">
          <strong>{readyText}</strong>
          <button type="button" className="primary press" onClick={onStart}>
            {startText}
          </button>
        </div>
      )}
      <div className={s.tabs} role="tablist" aria-label="Juegos">
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={g.id === game}
            className={s.tab}
            onClick={() => setGame(g.id)}
          >
            {g.name}
          </button>
        ))}
      </div>
      <div className={s.board}>
        <div className={s.hud}>
          <span className="num">Puntos · {score}</span>
          <span className="num" title="Récord en este dispositivo">Récord · {record}</span>
          <button type="button" className={`${s.icon} press`} aria-label={paused ? "Seguir" : "Pausa"} onClick={togglePause} disabled={over}>
            {paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
          </button>
        </div>
        <canvas
          ref={canvas}
          className={s.canvas}
          tabIndex={0}
          role="img"
          aria-label={`${meta.name}. ${meta.how}`}
          onFocus={() => {
            if (paused && !over) {
              api.current?.resume();
              setPaused(false);
            }
          }}
        />
        {(over || paused) && (
          <div className={s.overlay}>
            <strong>{over ? `Fin · ${score} ${score === 1 ? "punto" : "puntos"}` : "En pausa"}</strong>
            {over ? (
              <button type="button" className="secondary press" onClick={again}>
                <RotateCcw size={16} aria-hidden="true" /> Volver a jugar
              </button>
            ) : (
              <button type="button" className="secondary press" onClick={togglePause}>
                <Play size={16} aria-hidden="true" /> Seguir
              </button>
            )}
          </div>
        )}
      </div>
      <p className={s.how}>{meta.how}</p>
      <button type="button" className={`secondary press ${s.close}`} onClick={onClose}>
        Cerrar juego
      </button>
    </section>
  );
}
