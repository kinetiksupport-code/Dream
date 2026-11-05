import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApuntesMuestra } from "@/components/apuntes-limpios/apuntes-muestra";

// Banco de pruebas visual de «Apuntes» (docs/APUNTES-LIMPIOS.md): dibuja el
// ejemplo de al-Ándalus o el JSON que inyecta scripts/apuntes/capturas.mjs.
// Apagado salvo con DREAM_STYLE_LAB=1: en producción da 404.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Apuntes de muestra",
  robots: { index: false, follow: false },
};

export default function ApuntesMuestraPage() {
  if (process.env.DREAM_STYLE_LAB !== "1") notFound();
  return <ApuntesMuestra />;
}
