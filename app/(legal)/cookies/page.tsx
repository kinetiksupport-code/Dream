import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { COOKIES_MD } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Almacenamiento y cookies",
  description:
    "Qué guarda Dream en tu navegador, para qué sirve y qué necesita tu consentimiento.",
};

export default function CookiesPage() {
  return (
    <LegalDocument
      title="Almacenamiento en el dispositivo y cookies"
      content={COOKIES_MD}
    />
  );
}
