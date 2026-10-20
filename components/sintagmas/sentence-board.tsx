"use client";
// La frase y sus rayas (prompt «sintagmas» §3). Un único gesto: arrastrar
// sobre las palabras (o doble clic en una). La raya se imanta a palabras
// enteras, crece en azul mientras arrastras, se pone en roja si cruzaría otra
// y queda gris hasta que tiene etiqueta. Con teclado: flechas para moverte,
// Mayús+flechas para abarcar palabras, Intro para dibujar la raya, Supr para
// borrarla.
import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Check, X } from "lucide-react";
import {
  displayLabel,
  fullName,
} from "@/supabase/functions/dream-api/sintagmas.mjs";
import {
  markRows,
  wouldCross,
  type CheckSpan,
  type Mark,
  type SyntaxLabel,
  type SyntaxNames,
} from "@/lib/sintagmas";
import { LabelPicker } from "./label-picker";
import s from "./sintagmas.module.css";

type Span = { start: number; end: number };
type Drag =
  | { kind: "draw"; anchor: number; span: Span; moved: boolean }
  | { kind: "resize"; id: string; edge: "start" | "end"; span: Span };

const ordered = (a: number, b: number): Span => ({ start: Math.min(a, b), end: Math.max(a, b) + 1 });

export function SentenceBoard({
  words,
  marks,
  names,
  write,
  recent,
  onChange,
  onLabel,
  hinted,
  result,
  onShowOptions,
}: {
  words: string[];
  marks: Mark[];
  names: SyntaxNames;
  /** Fase avanzada: el alumno escribe la etiqueta. */
  write: boolean;
  recent: SyntaxLabel[];
  onChange: (next: Mark[]) => void;
  onLabel: (label: SyntaxLabel) => void;
  /** Palabras que la Pista resalta. */
  hinted: Span | null;
  /** Tras Comprobar: cada tramo oficial con su estado (solo lectura). */
  result: { spans: CheckSpan[]; extra: Span[] } | null;
  onShowOptions: () => void;
}) {
  const board = useRef<HTMLDivElement>(null);
  const cells = useRef<DOMRect[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [keySpan, setKeySpan] = useState<Span | null>(null);
  const [notice, setNotice] = useState("");
  const wordRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const readOnly = !!result;

  // La raya nueva queda seleccionada con el selector de etiqueta abierto.
  const lastCount = useRef(marks.length);
  useLayoutEffect(() => {
    if (marks.length > lastCount.current) {
      const fresh = marks.at(-1);
      if (fresh && !fresh.label) {
        setSelected(fresh.id);
        setEditing(fresh.id);
      }
    }
    lastCount.current = marks.length;
  }, [marks]);

  const indexAt = (x: number) => {
    let best = 0;
    let distance = Infinity;
    cells.current.forEach((r, i) => {
      const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      if (d < distance) {
        distance = d;
        best = i;
      }
    });
    return best;
  };
  const measure = () => {
    cells.current = wordRefs.current.map((el) => el?.getBoundingClientRect() ?? new DOMRect());
  };

  function add(span: Span) {
    if (wouldCross(marks, span)) {
      setNotice("Las rayas no se pueden cruzar: una tiene que ir dentro de la otra.");
      return;
    }
    setNotice("");
    onChange([...marks, { id: crypto.randomUUID(), ...span, label: null }]);
  }

  function pointerDown(e: PointerEvent<HTMLDivElement>) {
    if (readOnly || e.button !== 0) return;
    const target = e.target as HTMLElement;
    const handle = target.closest<HTMLElement>("[data-handle]");
    if (handle) {
      const id = handle.dataset.mark!;
      const mark = marks.find((m) => m.id === id);
      if (!mark) return;
      measure();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ kind: "resize", id, edge: handle.dataset.handle as "start" | "end", span: { start: mark.start, end: mark.end } });
      e.preventDefault();
      return;
    }
    const word = target.closest<HTMLElement>("[data-word]");
    if (!word) return;
    measure();
    const anchor = Number(word.dataset.word);
    // Sin captura hasta que se mueve: así el doble clic llega a la palabra.
    setEditing(null);
    setDrag({ kind: "draw", anchor, span: ordered(anchor, anchor), moved: false });
  }
  function pointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const at = indexAt(e.clientX);
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId);
    if (drag.kind === "draw") {
      const span = ordered(drag.anchor, at);
      if (span.start !== drag.span.start || span.end !== drag.span.end)
        setDrag({ ...drag, span, moved: drag.moved || at !== drag.anchor });
    } else {
      const span =
        drag.edge === "start"
          ? { start: Math.min(at, drag.span.end - 1), end: drag.span.end }
          : { start: drag.span.start, end: Math.max(at + 1, drag.span.start + 1) };
      if (span.start !== drag.span.start || span.end !== drag.span.end) setDrag({ ...drag, span });
    }
  }
  function pointerUp() {
    if (!drag) return;
    setDrag(null);
    if (drag.kind === "draw") {
      if (drag.moved) add(drag.span);
      return;
    }
    if (wouldCross(marks, drag.span, drag.id)) {
      setNotice("Las rayas no se pueden cruzar: una tiene que ir dentro de la otra.");
      return;
    }
    onChange(marks.map((m) => (m.id === drag.id ? { ...m, ...drag.span } : m)));
  }

  function wordKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    if (readOnly) return;
    const move = (to: number) => {
      const next = Math.max(0, Math.min(words.length - 1, to));
      setCursor(next);
      wordRefs.current[next]?.focus();
      return next;
    };
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = move(i + (e.key === "ArrowRight" ? 1 : -1));
      if (e.shiftKey) {
        const anchor = keySpan ? (keySpan.start === i ? keySpan.end - 1 : keySpan.start) : i;
        setKeySpan(ordered(anchor, next));
      } else setKeySpan(null);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      add(keySpan ?? ordered(i, i));
      setKeySpan(null);
    } else if (e.key === "Escape") setKeySpan(null);
  }

  function markKey(e: KeyboardEvent<HTMLElement>, mark: Mark) {
    if (readOnly) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onChange(marks.filter((m) => m.id !== mark.id));
      setSelected(null);
      setEditing(null);
      wordRefs.current[mark.start]?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelected(mark.id);
      setEditing(mark.id);
    }
  }

  const draft = drag?.kind === "draw" && drag.moved ? drag.span : keySpan;
  const resizing = drag?.kind === "resize" ? drag : null;
  const shown = marks.map((m) => (resizing?.id === m.id ? { ...m, ...resizing.span } : m));
  const withDraft = draft ? [...shown, { id: "draft", ...draft, label: null }] : shown;
  const rows = markRows(withDraft);
  const draftBad = draft ? wouldCross(marks, draft) : false;
  const resizeBad = resizing ? wouldCross(marks, resizing.span, resizing.id) : false;
  // Tras comprobar: los tramos que faltaban se dibujan con línea discontinua.
  const missing = result?.spans.filter((x) => x.status === "missing") ?? [];
  const missingRows = markRows([
    ...shown,
    ...missing.map((x, i) => ({ id: `missing-${i}`, start: x.start, end: x.end, label: x.label })),
  ]);
  const statusOf = (m: Mark) => {
    if (!result) return undefined;
    const span = result.spans.find((x) => x.start === m.start && x.end === m.end && (x.label === m.label || x.given === m.label));
    if (span?.status === "correct") return "correct";
    return "wrong";
  };
  const textOf = (span: Span) => words.slice(span.start, span.end).join(" ");

  return (
    <div className={s.boardWrap}>
      <div
        ref={board}
        className={s.board}
        style={{
          gridTemplateColumns: `repeat(${words.length}, auto)`,
          ["--word-size" as string]: words.length > 10 ? "1.5rem" : words.length > 7 ? "2rem" : undefined,
        }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => setDrag(null)}
        data-dragging={drag ? "" : undefined}
      >
        <div role="toolbar" aria-label="Palabras de la frase" className={s.words}>
          {words.map((word, i) => {
            const inDraft = draft && i >= draft.start && i < draft.end;
            const inHint = hinted && hinted.start !== null && i >= hinted.start && i < hinted.end;
            return (
              <button
                key={i}
                ref={(el) => {
                  wordRefs.current[i] = el;
                }}
                type="button"
                className={s.word}
                style={{ gridColumn: i + 1 }}
                data-word={i}
                data-active={inDraft ? (draftBad ? "bad" : "draft") : undefined}
                data-hint={inHint ? "" : undefined}
                tabIndex={i === cursor ? 0 : -1}
                onFocus={() => setCursor(i)}
                onDoubleClick={() => !readOnly && add(ordered(i, i))}
                onKeyDown={(e) => wordKey(e, i)}
                aria-disabled={readOnly || undefined}
              >
                {word}
              </button>
            );
          })}
        </div>
        {shown.map((mark) => {
          const status = statusOf(mark);
          const isSelected = selected === mark.id && !readOnly;
          const bad = resizing?.id === mark.id && resizeBad;
          const name = mark.label ? displayLabel(mark.label, names) : "";
          return (
            <div
              key={mark.id}
              className={s.mark}
              style={{
                gridColumn: `${mark.start + 1} / ${mark.end + 1}`,
                gridRow: (result ? missingRows : rows).get(mark.id)! + 2,
              }}
              data-state={bad ? "bad" : status ?? (mark.label ? "labelled" : "empty")}
              data-selected={isSelected ? "" : undefined}
            >
              <span className={s.bracket} aria-hidden="true" />
              <button
                type="button"
                className={s.tag}
                aria-label={`${mark.label ? `${name}, ${fullName(mark.label, names)}` : "Raya sin etiqueta"}: ${textOf(mark)}${status === "correct" ? ". Correcto" : status === "wrong" ? ". Revisar" : ""}`}
                aria-expanded={readOnly ? undefined : editing === mark.id}
                onClick={() => {
                  if (readOnly) return;
                  setSelected(mark.id);
                  setEditing(editing === mark.id ? null : mark.id);
                }}
                onKeyDown={(e) => markKey(e, mark)}
              >
                {status === "correct" && <Check size={14} aria-hidden="true" />}
                {status === "wrong" && <X size={14} aria-hidden="true" />}
                {name || "?"}
              </button>
              {isSelected && (
                <>
                  <span className={s.handle} data-handle="start" data-mark={mark.id} data-edge="start" aria-hidden="true" />
                  <span className={s.handle} data-handle="end" data-mark={mark.id} data-edge="end" aria-hidden="true" />
                </>
              )}
              {editing === mark.id && !readOnly && (
                <LabelPicker
                  names={names}
                  write={write}
                  recent={recent}
                  current={mark.label}
                  onPick={(label) => {
                    onChange(marks.map((m) => (m.id === mark.id ? { ...m, label } : m)));
                    onLabel(label);
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                  onDelete={() => {
                    onChange(marks.filter((m) => m.id !== mark.id));
                    setEditing(null);
                    setSelected(null);
                  }}
                  onShowOptions={onShowOptions}
                />
              )}
            </div>
          );
        })}
        {draft && (
          <div
            className={s.mark}
            style={{ gridColumn: `${draft.start + 1} / ${draft.end + 1}`, gridRow: rows.get("draft")! + 2 }}
            data-state={draftBad ? "bad" : "draft"}
            aria-hidden="true"
          >
            <span className={s.bracket} />
          </div>
        )}
        {missing.map((span, i) => (
          <div
            key={`missing-${i}`}
            className={s.mark}
            style={{ gridColumn: `${span.start + 1} / ${span.end + 1}`, gridRow: missingRows.get(`missing-${i}`)! + 2 }}
            data-state="missing"
          >
            <span className={s.bracket} aria-hidden="true" />
            <span className={s.tag}>
              <span className="visually-hidden">Faltaba: </span>
              {displayLabel(span.label, names)}
            </span>
          </div>
        ))}
      </div>
      <p className={s.notice} role="status" aria-live="polite">
        {notice}
      </p>
    </div>
  );
}
