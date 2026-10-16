import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { avisoLegal } from "@/content/legal/aviso-legal";

export const metadata: Metadata = { title: "Aviso legal · Dream" };

export default function Page() {
  return <LegalPage content={avisoLegal} />;
}
