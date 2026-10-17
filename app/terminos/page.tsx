import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { terminos } from "@/content/legal/terminos";

export const metadata: Metadata = { title: "Términos y condiciones · Dream" };

export default function Page() {
  return <LegalPage content={terminos} />;
}
