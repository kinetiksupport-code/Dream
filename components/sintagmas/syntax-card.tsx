"use client";
// Tarjeta del chat cuando la IA responde con <!--DREAM_ACTION:SINTAGMAS-->
// (prompt «sintagmas» §1): como la de los tests, con «Empezar». En móvil o
// tableta, en su lugar, el aviso de solo ordenador.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Spline } from "lucide-react";
import { DesktopOnly, useDesktop } from "./desktop-only";

export function SyntaxCard() {
  const desktop = useDesktop();
  const conversation = useSearchParams().get("c");
  if (desktop === null) return null;
  if (!desktop) return <DesktopOnly compact />;
  return (
    <Link
      className="quiz-widget press"
      data-mode="practice"
      href={conversation ? `/sintagmas?c=${encodeURIComponent(conversation)}` : "/sintagmas"}
    >
      <span className="quiz-icon" aria-hidden="true">
        <Spline size={22} />
      </span>
      <span className="quiz-text">
        <small>Actividad</small>
        <strong>Repasa los sintagmas</strong>
        <span>Marca y etiqueta frases</span>
      </span>
      <span className="quiz-start">
        Empezar
        <ArrowRight size={18} className="quiz-arrow" aria-hidden="true" />
      </span>
    </Link>
  );
}
