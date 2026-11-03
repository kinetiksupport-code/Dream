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
import { ArrowDown, ArrowLeft, BookOpen, CalendarDays, Check, Goal, Layers as LayersIcon, Lock, PencilLine, Star, Trophy, ChevronDown, ChevronRight, MoreHorizontal, RotateCcw, Route as RouteIcon, BarChart3, FileText, Layers, Compass } from "lucide-react";
import type { DreamExam } from "@/lib/exam-plans";
import type { RouteView, RouteViewNode } from "@/lib/study-path";
import { DueLink, goalText, useStudyToday } from "../study-today";
import { LiveSubjectObject } from "../subject-object-live";
import { hasWebGL2, readDevice, wants3D } from "@/lib/subject-3d";
import { PIECE, STEP_LABEL, STEP_PIECE, masteryOf, stepGroups, subjectPiece } from "@/lib/study-steps";
import { BottomSheet } from "../bottom-sheet";
import { ProgressView } from "../progress/progress-view";
import s from "./study-route.module.css";

/** Curva suave del camino, como en las capturas de Knowunity: derecha, izquierda, izquierda, derecha. */
const OFFSETS = [1, 0, 0, 1];
/** Icono de cada tipo de paso (círculos de la ruta). */
const STEP_ICON = { study: BookOpen, practice: PencilLine, review: LayersIcon, mock: Trophy } as const;

function Piece({ name, size = 72, className }: { name: string; size?: number; className?: string }) {
  // Decorativas: el estado y el nombre se leen en el texto del botón.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={PIECE(name)} alt="" width={size} height={size} className={className} draggable={false} />;
}

/**
 * Objeto 3D de la cabecera (Entrega 3): en ordenador (≥ 1024 px, ratón, WebGL 2,
 * sin movimiento reducido ni ahorro de datos) el modelo vivo, que se carga
 * después de pintar, se pausa fuera de pantalla y vuelve a la pieza plana si
 * va a menos de 40 fps. En móvil, tableta o sin WebGL, la pieza de siempre,
 * con el mismo tamaño: no se mueve nada.
 */
function SubjectHeaderObject({ subject, className }: { subject: string; className?: string }) {
  const [live, setLive] = useState(false);
  useEffect(() => setLive(wants3D(readDevice(window)) && hasWebGL2(document)), []);
  return live ? (
    <span className={className} data-testid="ruta-3d" style={{ display: "inline-grid", width: 40, height: 40 }}>
      <LiveSubjectObject subject={subject} size={40} float={false} />
    </span>
  ) : (
    <Piece name={subjectPiece(subject)} size={40} className={className} />
  );
}

function Step({
  node,
  index,
  current = false,
  ring = 0,
  onOpen,
}: {
  node: RouteViewNode;
  index: number;
  current?: boolean;
  /** Anillo de progreso del nodo actual: lo hecho de su sección, 0-100 (0.11 · 1). */
  ring?: number;
  onOpen: (n: RouteViewNode) => void;
}) {
  const done = node.state === "completed";
  const state = done ? "hecha" : current ? "actual" : "bloq";
  const status = done ? "hecha" : current ? "ahora" : "pendiente";
  const Icon = STEP_ICON[node.type] ?? BookOpen;
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
        {/* Círculo grande con icono (estado-14): hecho, actual (rayado y con anillo), siguiente o bloqueado. */}
        <span className={s.node} aria-hidden="true">
          {current && (
            <svg className={s.ring} viewBox="0 0 88 88" aria-hidden="true">
              <circle cx="44" cy="44" r="40" className={s.ringTrack} />
              <circle cx="44" cy="44" r="40" className={s.ringFill} pathLength={100} strokeDasharray="100 100" style={{ ["--off" as string]: 100 - Math.max(6, ring) }} />
            </svg>
          )}
          <span className={s.disc}>
            {done ? <Check size={30} strokeWidth={2.5} /> : current ? <Star size={30} strokeWidth={2.2} fill="currentColor" /> : state === "bloq" && index > 1 ? <Lock size={24} /> : <Icon size={28} />}
          </span>
        </span>
        {/* Una sola frase corta al lado del círculo (0.11 · 1). */}
        <span className={s.stepText}>
          {current && <span className={s.now}>Ahora</span>}
          <span className={s.stepTitle}>{node.title}</span>
        </span>
      </button>
    </li>
  );
}

/** Tema de un nodo: cada sección de la ruta es un tema del temario (0.11 · 1). */
const topicOf = (n: RouteViewNode) => (n.type === "mock" ? "" : n.unit?.topic || n.topic || "");

/**
 * Pinta los nodos con un separador (línea + nombre) cada vez que empieza otro
 * tema. El primer tema visible no lleva separador: su nombre va en la barra de
 * sección de arriba.
 */
function Steps({ list, current, start, ring, onOpen, firstTopic }: { list: RouteViewNode[]; current: RouteViewNode | null; start: number; ring: number; onOpen: (n: RouteViewNode) => void; firstTopic: string }) {
  let topic = firstTopic;
  return (
    <>
      {list.flatMap((n, i) => {
        const t = topicOf(n);
        const out = [];
        if (t && t !== topic) {
          topic = t;
          out.push(
            <li key={`sep-${n.key}`} className={s.sep} data-testid="separador-seccion">
              <span>{t}</span>
            </li>,
          );
        }
        out.push(<Step key={n.key} node={n} index={start + i} current={n === current} ring={n === current ? ring : 0} onOpen={onOpen} />);
        return out;
      })}
    </>
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
  const today = useStudyToday();
  // 3 siguientes, como en el diseño (presupuesto de 12 con el simulacro final a la vista).
  // Con el repaso de hoy en la cabecera, 2: el resto va en «+N lecciones más» (Bloque 6.1).
  // La barra de sección (0.11 · 1) cuenta como un elemento más: un paso menos a la vista.
  const g = stepGroups(route.nodes, route.next, today?.due ? 1 : 2);
  const next = g.current ?? g.final;
  const mastery = masteryOf(exam.sessions);
  // Meta de dominio con fecha (Bloque 6.4): minutos al día que quedan, en el cliente, sin IA.
  const left = exam.units.filter((u) => u.status !== "completed").reduce((a, u) => a + (u.estimated_minutes ?? 0), 0);
  const perDay = p.days !== null && p.days > 0 && left > 0 ? Math.max(5, Math.round(left / p.days)) : null;
  const upcoming = showAll ? [...g.upcoming, ...g.hidden] : g.upcoming;
  // Sección actual = tema del paso actual; el anillo enseña lo hecho de esa sección.
  const section = g.current ? topicOf(g.current) : "";
  const inSection = section ? route.nodes.filter((n) => topicOf(n) === section) : [];
  const sectionPct = inSection.length ? Math.round((100 * inSection.filter((n) => n.state === "completed").length) / inSection.length) : 0;

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

  // Cabecera centrada (estado-14): asignatura y «N días · Nota objetivo».
  const header = (
    <header className={s.head}>
      <div className={s.subject}>
        <SubjectHeaderObject subject={exam.subject} className={s.subjectPiece} />
        <h1 className={s.title}>{exam.subject.trim() || exam.title}</h1>
      </div>
      {exam.subject.trim() && exam.title !== exam.subject && <p className={s.examName}>{exam.title}</p>}
      <p className={s.facts}>
        {p.days !== null && p.days >= 0 && (
          <span>
            <CalendarDays size={16} aria-hidden="true" />
            <span className="num">{p.days === 0 ? "Es hoy" : p.days === 1 ? "1 día" : `${p.days} días`}</span>
          </span>
        )}
        {typeof exam.target_grade === "number" && (
          <span>
            <Goal size={16} aria-hidden="true" />
            Nota objetivo: <span className="num">{String(exam.target_grade).replace(".", ",")}</span>
          </span>
        )}
        {perDay !== null && (
          <span>
            ≈ <span className="num">{perDay} min</span> al día
          </span>
        )}
        {mastery !== null && (
          <span>
            Dominio <span className="num">{mastery} %</span>
          </span>
        )}
      </p>
      {today && (
        <p className={s.today}>
          <DueLink today={today} className={`${s.dueLink} press`} from={exam.id} />
          <span className={s.goal}>{goalText(today)}</span>
        </p>
      )}
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
          <Link role="menuitem" className={s.menuItem} href={`/exams/${exam.id}/tarjetas`}>
            <Layers size={18} aria-hidden="true" /> Mis tarjetas
          </Link>
          <Link role="menuitem" className={s.menuItem} href={`/exams/${exam.id}/simulacro?tipo=diagnostico`}>
            <Compass size={18} aria-hidden="true" /> Tu punto de partida
          </Link>
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
            {section && next && (
              <div className={s.sectionBar} data-testid="barra-seccion">
                <span className={s.sectionName}>
                  <span className="visually-hidden">Sección: </span>
                  {section}
                </span>
                <button type="button" className={`${s.book} press`} aria-label={`Resumen de «${section}»`} onClick={() => setOpen(g.current ?? next)}>
                  <BookOpen size={20} aria-hidden="true" />
                </button>
              </div>
            )}
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
              <Steps
                list={[...(showDone ? g.done : []), ...(g.current ? [g.current] : []), ...upcoming]}
                current={g.current}
                start={0}
                ring={sectionPct}
                onOpen={setOpen}
                firstTopic={showDone && g.done[0] ? topicOf(g.done[0]) : section}
              />
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
              {/* «Ya me sé este tema» (Bloque 6.8): el test directo; si lo supera, la lección cuenta. */}
              {open.type === "study" && open.state !== "completed" && p.hrefFor(open) && (
                <Link className="secondary press" href={`${p.hrefFor(open)}?ya=1`}>
                  Ya me sé este tema
                </Link>
              )}
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
