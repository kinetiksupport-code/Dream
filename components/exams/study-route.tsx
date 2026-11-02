"use client";
// Ruta de estudio rediseñada (Entrega 0 del prompt de la ruta; diseño de
// Claude Design «Dream · Experiencia de estudio», PantallaRutaEscritorio y
// PantallaRutaMovil). Solo rediseño: las acciones son las de hoy (abrir la
// lección, hacer un test, ir al simulacro, rehacer la ruta).
// - Escritorio: cabecera a la izquierda, camino a la derecha y «A
//   continuación» flotando abajo. Móvil: barra con pestañas arriba, cabecera
//   compacta, camino y «A continuación» fija abajo, al alcance del pulgar.
// - Presupuesto (0.4): ≤ 12 elementos visibles. El detalle va en la hoja.
// - Movimiento: solo transform y opacity (globals.css › .press, hoja).
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ChevronDown, ChevronRight, MoreHorizontal, RotateCcw, Route as RouteIcon, BarChart3, FileText } from "lucide-react";
import type { DreamExam } from "@/lib/exam-plans";
import type { RouteView, RouteViewNode } from "@/lib/study-path";
import { PIECE, STEP_LABEL, STEP_PIECE, masteryOf, stepGroups, subjectPiece } from "@/lib/study-steps";
import { BottomSheet } from "../bottom-sheet";
import { ProgressView } from "../progress/progress-view";
import s from "./study-route.module.css";

/** Zigzag suave del camino: 0, 1, 2, 1… pasos hacia la derecha. */
const OFFSETS = [0, 1, 2, 1];

function Piece({ name, size = 72, className }: { name: string; size?: number; className?: string }) {
  // Decorativas: el estado y el nombre se leen en el texto del botón.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={PIECE(name)} alt="" width={size} height={size} className={className} draggable={false} />;
}

function Step({
  node,
  index,
  current = false,
  onOpen,
}: {
  node: RouteViewNode;
  index: number;
  current?: boolean;
  onOpen: (n: RouteViewNode) => void;
}) {
  const done = node.state === "completed";
  const state = done ? "hecha" : current ? "actual" : "bloq";
  const status = done ? "hecha" : current ? "ahora" : "pendiente";
  return (
    <li
      className={s.stepItem}
      data-current={current || undefined}
      // Zigzag y escalonado de entrada (0.8 · 17): 40 ms entre nodos, máx. 4.
      style={{ ["--o" as string]: OFFSETS[index % 4], ["--i" as string]: Math.min(index, 4) }}
    >
      <button
        type="button"
        className={`${s.step} press`}
        data-state={state}
        data-testid={`paso-${node.key}`}
        aria-label={`${STEP_LABEL[node.type]}: ${node.title}, ${status}`}
        onClick={() => onOpen(node)}
      >
        <span className={s.piece} aria-hidden="true">
          {current && <span className={s.halo} />}
          <Piece name={state} />
          {current && <Piece name={STEP_PIECE[node.type]} size={44} className={s.badge} />}
        </span>
        {current ? (
          <span className={s.now}>Ahora</span>
        ) : (
          <span className={s.stepText}>
            <span className={s.stepType}>{STEP_LABEL[node.type]}</span>
            <span className={s.stepTitle}>{node.title}</span>
          </span>
        )}
      </button>
    </li>
  );
}

export interface StudyRouteProps {
  exam: DreamExam;
  route: RouteView;
  /** Lecciones completadas y total (preparación de la gema). */
  units: { completed: number; total: number; percentage: number };
  days: number | null;
  busy: boolean;
  online: boolean;
  canRegenerate: boolean;
  celebrating: boolean;
  announce: string;
  onRegenerate: () => void;
  onPractice: (node: RouteViewNode) => void;
  /** Destino de «Continuar» y de la acción principal de la hoja. */
  hrefFor: (node: RouteViewNode) => string | null;
  error?: React.ReactNode;
}

export function StudyRoute(p: StudyRouteProps) {
  const { exam, route } = p;
  const [tab, setTab] = useState<"ruta" | "progreso">("ruta");
  const [menu, setMenu] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<RouteViewNode | null>(null);
  const pathRef = useRef<HTMLOListElement>(null);
  const gemRef = useRef<HTMLElement>(null);
  // ↓ «Ir a la lección actual» cuando el nodo actual sale de la vista (0.8 · 13).
  const [away, setAway] = useState(false);
  // La gema dibuja su anillo la primera vez que se ve (lámina, 18).
  const [gemSeen, setGemSeen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();
  // 3 siguientes, como en el diseño (presupuesto de 12 con el simulacro final a la vista).
  const g = stepGroups(route.nodes, route.next, 3);
  const next = g.current ?? g.final;
  const mastery = masteryOf(exam.sessions);
  const upcoming = showAll ? [...g.upcoming, ...g.hidden] : g.upcoming;

  // El menú «⋯» se cierra con Esc o al pulsar fuera.
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [menu]);

  useEffect(() => {
    if (tab !== "ruta" || typeof IntersectionObserver === "undefined") return;
    const current = pathRef.current?.querySelector("[data-current]");
    const gem = gemRef.current;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === gem && e.isIntersecting) setGemSeen(true);
        if (e.target === current) setAway(!e.isIntersecting);
      }
    }, { threshold: 0.4 });
    if (current) io.observe(current);
    if (gem) io.observe(gem);
    return () => io.disconnect();
  }, [tab, showDone, showAll]);

  // Vuelta de una lección terminada (?hecho=…): el camino se desplaza solo hasta
  // dejar a la vista la siguiente lección (0.8 · 11). Con movimiento reducido, sin animar.
  useEffect(() => {
    if (!p.celebrating) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    pathRef.current?.querySelector("[data-current]")?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [p.celebrating]);

  function goCurrent() {
    const el = pathRef.current?.querySelector<HTMLElement>("[data-current] button");
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  }

  function primary(node: RouteViewNode) {
    const href = p.hrefFor(node);
    return href ? (
      <Link className={`primary press ${s.go}`} href={href}>
        Continuar
      </Link>
    ) : (
      // El botón pasa a «cargando» en su sitio (0.8 · 2): mismo tamaño, el texto
      // se funde con un indicador y «Elige otra» se atenúa.
      <button type="button" className={`primary press ${s.go}`} data-busy={p.busy || undefined} disabled={p.busy || !p.online} aria-busy={p.busy || undefined} onClick={() => p.onPractice(node)}>
        <span className={s.goText}>Continuar</span>
        <span className={s.spinner} aria-hidden="true" />
      </button>
    );
  }

  const header = (
    <header className={s.head}>
      <div className={s.subject}>
        <Piece name={subjectPiece(exam.subject)} size={60} className={s.subjectPiece} />
        <span className={s.eyebrow}>{exam.subject}</span>
      </div>
      <h1 className={s.title}>{exam.title}</h1>
      <p className={s.facts}>
        {p.days !== null && p.days >= 0 && (
          <span>
            {p.days === 0 ? "Es " : "Faltan "}
            <strong className="num">{p.days === 0 ? "hoy" : p.days === 1 ? "1 día" : `${p.days} días`}</strong>
          </span>
        )}
        {mastery !== null && (
          <span>
            Dominio <strong className="num">{mastery} %</strong>
          </span>
        )}
      </p>
    </header>
  );

  const tabs = (
    <div className={s.tabs} role="tablist" aria-label="Vista" data-tab={tab}>
      {/* Indicador que se desliza entre pestañas (lámina, 24). */}
      <span className={s.tabThumb} aria-hidden="true" />
      {(["ruta", "progreso"] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          id={`${id}-${t}`}
          aria-selected={tab === t}
          aria-controls={`${id}-panel`}
          className={s.tab}
          onClick={() => setTab(t)}
        >
          {t === "ruta" ? <RouteIcon size={18} aria-hidden="true" /> : <BarChart3 size={18} aria-hidden="true" />}
          {t === "ruta" ? "Ruta" : "Progreso"}
        </button>
      ))}
    </div>
  );

  const more = (
    <div className={s.moreWrap} ref={menuRef}>
      <button
        type="button"
        className={`${s.round} press`}
        aria-label="Más opciones"
        aria-haspopup="menu"
        aria-expanded={menu}
        onClick={() => setMenu((m) => !m)}
      >
        <MoreHorizontal size={20} aria-hidden="true" />
      </button>
      {menu && (
        <div className={s.menu} role="menu" aria-label="Más opciones">
          {p.canRegenerate && (
            <button
              type="button"
              role="menuitem"
              className={s.menuItem}
              disabled={p.busy || !p.online}
              onClick={() => {
                setMenu(false);
                p.onRegenerate();
              }}
            >
              <RotateCcw size={18} aria-hidden="true" /> {p.busy ? "Rehaciendo…" : "Rehacer mi ruta"}
            </button>
          )}
          <Link role="menuitem" className={s.menuItem} href={`/exams/${exam.id}`}>
            <FileText size={18} aria-hidden="true" /> Mi examen y mis apuntes
          </Link>
        </div>
      )}
    </div>
  );

  return (
    <div className={s.screen} data-testid="ruta-pasos">
      <div className={s.bar}>
        <Link className={`${s.round} ${s.back} press`} href={`/exams/${exam.id}`} aria-label="Volver al examen">
          <ArrowLeft size={20} aria-hidden="true" />
          <span className={s.backText}>Examen</span>
        </Link>
        <div className={s.barTabs}>{tabs}</div>
        <div className={s.barMore}>{more}</div>
      </div>

      <aside className={s.side}>
        {header}
        <div className={s.sideTabs}>{tabs}</div>
        <div className={s.sideMore}>{more}</div>
      </aside>

      <div className={s.main} id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`}>
        {tab === "progreso" ? (
          <div className={s.progress}>
            <ProgressView />
          </div>
        ) : (
          <>
            <div className={s.mobileHead}>{header}</div>
            <p className="visually-hidden" role="status">
              {p.announce}
            </p>
            {g.done.length > 0 && (
              <button type="button" className={`${s.pill} press`} aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
                <Piece name="hecha" size={22} />
                <span>
                  <span className="num">{g.done.length}</span> {g.done.length === 1 ? "lección hecha" : "lecciones hechas"}
                </span>
                {showDone ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
              </button>
            )}
            <ol className={s.path} ref={pathRef} aria-label="Tu camino" data-celebrating={p.celebrating ? "" : undefined}>
              {showDone && g.done.map((n, i) => <Step key={n.key} node={n} index={i} onOpen={setOpen} />)}
              {g.current && <Step node={g.current} index={showDone ? g.done.length : 0} current onOpen={setOpen} />}
              {upcoming.map((n, i) => (
                <Step key={n.key} node={n} index={(showDone ? g.done.length : 0) + i + 1} onOpen={setOpen} />
              ))}
            </ol>
            {g.hidden.length > 0 && !showAll && (
              <button type="button" className={`${s.pill} ${s.center} press`} onClick={() => setShowAll(true)}>
                <span>
                  +<span className="num">{g.hidden.length}</span> {g.hidden.length === 1 ? "lección más" : "lecciones más"}
                </span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            )}
            {g.final && (
              <ol className={`${s.path} ${s.finalPath}`} aria-label="Al final">
                <Step node={g.final} index={1} current={g.current === null} onOpen={setOpen} />
              </ol>
            )}
            <section className={s.gem} aria-labelledby={`${id}-gema`} ref={gemRef} data-seen={gemSeen || undefined}>
              <span className={s.gemRing} role="img" aria-label={`Preparación ${p.units.percentage} %`}>
                <svg viewBox="0 0 160 160" aria-hidden="true">
                  <circle cx="80" cy="80" r="72" className={s.gemTrack} />
                  <circle
                    cx="80"
                    cy="80"
                    r="72"
                    className={s.gemFill}
                    pathLength={100}
                    strokeDasharray="100 100"
                    style={{ ["--off" as string]: 100 - p.units.percentage }}
                  />
                </svg>
                <Piece name="gema" size={96} />
              </span>
              <h2 id={`${id}-gema`} className={s.gemTitle}>
                Preparación <span className="num">{p.units.percentage} %</span>
              </h2>
              <p className={s.muted}>
                <span className="num">{p.units.completed}</span> de <span className="num">{p.units.total}</span> lecciones hechas.
              </p>
            </section>
          </>
        )}
      </div>

      {tab === "ruta" && next && (
        <section className={s.next} aria-labelledby={`${id}-next`}>
          <div className={s.nextText} key={next.key}>
            <span className={s.nextEyebrow}>A continuación · {STEP_LABEL[next.type]}</span>
            <h2 id={`${id}-next`} className={s.nextTitle}>
              {next.title}
            </h2>
          </div>
          <div className={s.nextActions}>
            <button
              type="button"
              className={`secondary press ${s.other}`}
              disabled={p.busy}
              onClick={() => {
                // «Elige otra» despliega el camino entero y lleva el foco a él.
                setShowDone(true);
                setShowAll(true);
                pathRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
              }}
            >
              Elige otra
            </button>
            {primary(next)}
          </div>
        </section>
      )}

      {tab === "ruta" && (
        <button
          type="button"
          className={`${s.toCurrent} press`}
          data-show={away || undefined}
          aria-hidden={!away || undefined}
          tabIndex={away ? 0 : -1}
          aria-label="Ir a la lección actual"
          onClick={goCurrent}
        >
          <ArrowDown size={22} aria-hidden="true" />
        </button>
      )}
      <p className="visually-hidden" role="status">
        {p.busy ? "Preparando tu test" : ""}
      </p>
      {open && (
        <BottomSheet labelledBy={`${id}-sheet`} onClose={() => setOpen(null)}>
          <div className={s.sheet} data-testid="route-sheet">
            <div className={s.sheetHead}>
              <Piece name={open.state === "completed" ? "hecha" : STEP_PIECE[open.type]} size={64} />
              <div>
                <p className={s.eyebrow}>
                  {STEP_LABEL[open.type]}
                  {open.when ? ` · ${open.when}` : ""}
                </p>
                <h2 id={`${id}-sheet`} className={s.sheetTitle}>
                  {open.title}
                </h2>
                <p className={s.muted}>
                  <span className="num">{open.minutes}</span> min
                  {open.mastery ? (
                    <>
                      {" "}· dominio <span className="num">{open.mastery.percentage} %</span>
                    </>
                  ) : null}
                </p>
              </div>
            </div>
            <p>{open.type === "study" && open.unit ? open.unit.summary : open.node.reason}</p>
            {open.type === "study" && open.node.reason && <p className={s.reason}>{open.node.reason}</p>}
            {open.before && (
              <p className={s.muted}>Te recomendamos antes «{open.before.title}». Puedes hacerla igualmente.</p>
            )}
            <div className={s.sheetActions}>
              <button type="button" className="secondary press" onClick={() => setOpen(null)}>
                Cerrar
              </button>
              {open.type !== "study" && open.type !== "mock" ? (
                <button type="button" className="primary press" disabled={p.busy || !p.online} onClick={() => p.onPractice(open)}>
                  {p.busy ? "Preparando…" : "Hacer el test"}
                </button>
              ) : p.hrefFor(open) ? (
                <Link className="primary press" href={p.hrefFor(open)!}>
                  {open.state === "completed" ? "Repasar" : open.type === "mock" ? "Ir al simulacro" : "Empezar"}
                </Link>
              ) : null}
            </div>
          </div>
        </BottomSheet>
      )}
      {p.error}
    </div>
  );
}
