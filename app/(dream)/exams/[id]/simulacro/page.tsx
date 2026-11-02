import { notFound } from "next/navigation";
import { MockFlow } from "@/components/exams/mock-flow";
import { studyStepsEnabled } from "@/lib/study-steps";
import type { MockKind } from "@/lib/study-api";

const KIND: Record<string, MockKind> = { final: "final", bloque: "block", diagnostico: "diagnostic" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Simulacro de la ruta (Bloque 5): diagnóstico, de bloque y final.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string; s?: string }>;
}) {
  if (!studyStepsEnabled()) notFound();
  const { id } = await params;
  const { tipo, s } = await searchParams;
  return <MockFlow key={tipo} examId={id} kind={KIND[tipo ?? ""] ?? "final"} sessionId={s && UUID.test(s) ? s : null} />;
}
