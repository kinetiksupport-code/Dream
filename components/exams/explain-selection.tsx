"use client";
// «Explicar» al seleccionar texto de una corrección (prompt «explicar bien», 3):
// al soltar una selección de 3 a 300 caracteres dentro de la zona, aparece un
// botón pequeño encima; al pulsarlo se abre el «¿Por qué?» con ese trozo.
// Solo se usa en preguntas ya corregidas.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import s from "./explain-selection.module.css";

export function ExplainSelection({
  children,
  onExplain,
}: {
  children: ReactNode;
  onExplain: (text: string) => void;
}) {
  const zone = useRef<HTMLDivElement>(null);
  const [pick, setPick] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    const read = () => {
      const sel = window.getSelection();
      const text = sel?.toString().replace(/\s+/g, " ").trim() ?? "";
      const node = sel?.anchorNode;
      if (
        !sel ||
        sel.isCollapsed ||
        text.length < 3 ||
        text.length > 300 ||
        !node ||
        !zone.current?.contains(node)
      ) {
        setPick(null);
        return;
      }
      const box = sel.getRangeAt(0).getBoundingClientRect();
      const host = zone.current.getBoundingClientRect();
      setPick({
        text,
        x: box.left + box.width / 2 - host.left,
        y: box.top - host.top,
      });
    };
    const late = () => window.setTimeout(read, 0);
    document.addEventListener("mouseup", late);
    document.addEventListener("touchend", late);
    document.addEventListener("keyup", late);
    return () => {
      document.removeEventListener("mouseup", late);
      document.removeEventListener("touchend", late);
      document.removeEventListener("keyup", late);
    };
  }, []);
  return (
    <div ref={zone} className={s.zone}>
      {children}
      {pick && (
        <button
          type="button"
          className={`${s.explain} press`}
          style={{ insetInlineStart: pick.x, insetBlockStart: pick.y }}
          // Sin perder la selección al pulsar con el ratón.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onExplain(pick.text);
            setPick(null);
            window.getSelection()?.removeAllRanges();
          }}
        >
          <Sparkles size={15} aria-hidden="true" />
          Explicar
        </button>
      )}
    </div>
  );
}
