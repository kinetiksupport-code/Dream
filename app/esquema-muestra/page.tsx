import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EsquemaMuestra } from "@/components/esquema/esquema-muestra";

// Banco de pruebas visual de los esquemas (docs/ESQUEMAS.md): dibuja el
// ejemplo de al-Ándalus o el JSON que inyecta scripts/esquemas/capturas.mjs.
// Apagado salvo con DREAM_STYLE_LAB=1, como /estilo: en producción da 404.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Esquema de muestra",
  robots: { index: false, follow: false },
};

export default function EsquemaMuestraPage() {
  if (process.env.DREAM_STYLE_LAB !== "1") notFound();
  return <EsquemaMuestra />;
}
