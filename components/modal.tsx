"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
/**
 * Accessible dialog. Rendered in a portal on <body> so the rest of the app can
 * be made inert while it is open; focus is trapped and restored on close.
 */
export function Modal({
  children,
  labelledBy,
  describedBy,
  onClose,
  variant = "sheet",
  leaving = false,
  className,
}: {
  children: ReactNode;
  labelledBy: string;
  describedBy?: string;
  onClose: () => void;
  /**
   * "sheet" (default): bottom sheet on phones, centred on wider screens.
   * "alert": a short confirmation, always centred, scaling in from 0.95.
   */
  variant?: "sheet" | "alert";
  /** True while the caller plays the exit fade before unmounting. */
  leaving?: boolean;
  /** Extra class on the dialog (e.g. "bottom-sheet" from BottomSheet). */
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // The control that opened the dialog, read on the first render: by the time
  // effects run, an autoFocus child has already taken focus.
  const opener = useRef<Element | null>(
    typeof document === "undefined" ? null : document.activeElement,
  );
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  // Layout effect: Escape, the focus trap and the inert app are in place in
  // the same commit that shows the dialog. As a passive effect they waited
  // for the next frame, and an Escape pressed right away (a keyboard user
  // who opens and closes at once) was lost and the dialog stayed open.
  useLayoutEffect(() => {
    if (!host) return;
    const previous = opener.current;
    const app = document.querySelector<HTMLElement>(".app-shell");
    if (app) app.inert = true;
    const el = ref.current;
    if (!el?.contains(document.activeElement)) {
      const initial = el?.querySelector<HTMLElement>(
        "[autofocus],input,button,a,select,textarea",
      );
      initial?.focus();
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === "Tab" && el) {
        const controls = Array.from(
          el.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],iframe",
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
      if (app) app.inert = false;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [host]);
  if (!host) return null;
  return createPortal(
    <div
      className={`modal-backdrop${variant === "alert" ? " modal-backdrop-alert" : ""}`}
      data-leaving={leaving || undefined}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        className={`modal${variant === "alert" ? " modal-alert" : ""}${className ? ` ${className}` : ""}`}
        role={variant === "alert" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
      >
        {children}
      </section>
    </div>,
    host,
  );
}
