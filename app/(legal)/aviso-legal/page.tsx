import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { LEGAL_NOTICE_MD } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Aviso legal",
  description: "Datos del titular de Dream Education (LSSI, artículo 10).",
};

export default function LegalNoticePage() {
  return <LegalDocument title="Aviso legal" content={LEGAL_NOTICE_MD} />;
}
