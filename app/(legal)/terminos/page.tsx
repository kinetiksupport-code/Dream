import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { TERMS_MD } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description:
    "Las condiciones para usar Dream: tu cuenta, los límites de uso, cómo ayuda la IA y las normas.",
};

export default function TermsPage() {
  return <LegalDocument title="Términos y condiciones" content={TERMS_MD} />;
}
