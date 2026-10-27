import type { Metadata } from "next";
import { EsquemaPage } from "@/components/esquema/esquema-page";

export const metadata: Metadata = { title: "Esquema" };

export default async function SchemePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EsquemaPage id={id} />;
}
