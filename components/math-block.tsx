import type { ReactNode } from "react";
/** Presentation only: formulas are rendered by the existing safe KaTeX pipeline. */
export function MathBlock({
  children,
  label,
  explanation,
}: {
  children: ReactNode;
  label?: string;
  explanation?: string;
}) {
  return (
    <span className="math-block">
      {label && <p className="math-label">{label}</p>}
      {children}
      {explanation && <p className="math-explanation">{explanation}</p>}
    </span>
  );
}
