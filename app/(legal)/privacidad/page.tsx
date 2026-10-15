import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { PRIVACY_MD } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Qué datos trata Dream, para qué, con quién se comparten y cómo ejercer tus derechos.",
};

export default function PrivacyPage() {
  return <LegalDocument title="Política de privacidad" content={PRIVACY_MD} />;
}
