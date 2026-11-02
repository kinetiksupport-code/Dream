"use client";
// Las pantallas nuevas de la ruta de estudio solo existen si esta cuenta la
// tiene encendida (flag o encendido por fases). Si no, «página no encontrada».
import type { ReactNode } from "react";
import { studyStepsEnabled } from "@/lib/study-steps";
import { NotFoundView } from "./not-found-view";

export function StudyGate({ children }: { children: ReactNode }) {
  return studyStepsEnabled() ? <>{children}</> : <NotFoundView />;
}
