/**
 * Botón primario de Dream design: el relleno verde neón nace en el punto por
 * donde entra el ratón. Un solo oyente para toda la página; solo escribe dos
 * variables CSS (--dd-x, --dd-y) en el botón. Sin ratón fino no hace nada.
 */
export function installPressGlow(): () => void {
  if (typeof window === "undefined" || !matchMedia("(hover: hover) and (pointer: fine)").matches) return () => {};
  const onOver = (e: PointerEvent) => {
    const target = (e.target as Element | null)?.closest?.<HTMLElement>(".primary, .quiz-start");
    if (!target || target.contains(e.relatedTarget as Node | null)) return;
    const r = target.getBoundingClientRect();
    // El pseudo-elemento ocupa el 180 % del botón (inset: -40 %).
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    target.style.setProperty("--dd-x", `${(40 + x) / 1.8}%`);
    target.style.setProperty("--dd-y", `${(40 + y) / 1.8}%`);
  };
  document.addEventListener("pointerover", onOver, { passive: true });
  return () => document.removeEventListener("pointerover", onOver);
}
