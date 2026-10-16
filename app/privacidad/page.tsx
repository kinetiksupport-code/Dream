import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { privacidad } from "@/content/legal/privacidad";

export const metadata: Metadata = { title: "Política de privacidad · Dream" };

export default function Page() {
  return <LegalPage content={privacidad} />;
}
