"use client";
import { useEffect, useRef, type ReactNode } from "react";
export function Modal({
  children,
  labelledBy,
  onClose,
  variant = "dialog",
}: {
  children: ReactNode;
  labelledBy: string;
  onClose: () => void;
  variant?: "dialog" | "sheet";
}) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const main = document.querySelector<HTMLElement>(".workspace");
    const aside = document.querySelector<HTMLElement>(".sidebar");
    if (main) main.inert = true;
    if (aside) aside.inert = true;
    const el = ref.current;
    const initial = el?.querySelector<HTMLElement>(
      "input,button,a,select,textarea",
    );
    initial?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === "Tab" && el) {
        const controls = Array.from(
          el.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]",
          ),
        );
        const first = controls[0];
        const last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (main) main.inert = false;
      if (aside) aside.inert = false;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <div
      className={`modal-backdrop ${variant === "sheet" ? "sheet-backdrop" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        className={`modal ${variant === "sheet" ? "bottom-sheet" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        {children}
      </section>
    </div>
  );
}
