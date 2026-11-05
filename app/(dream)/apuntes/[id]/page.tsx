import type { Metadata } from "next";
import { ApuntesPage } from "@/components/apuntes-limpios/apuntes-page";

export const metadata: Metadata = { title: "Apuntes" };

export default async function CleanNotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ApuntesPage id={id} />;
}
