import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StyleLab } from "@/components/style-lab";

// Catalogue of the new style's tokens and primitives (docs/diseno/estilo).
// Off unless the server runs with DREAM_STYLE_LAB=1: production answers 404.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Estilo",
  robots: { index: false, follow: false },
};

export default function EstiloPage() {
  if (process.env.DREAM_STYLE_LAB !== "1") notFound();
  return <StyleLab />;
}
