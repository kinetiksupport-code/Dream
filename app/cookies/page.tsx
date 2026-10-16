import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { cookies } from "@/content/legal/cookies";

export const metadata: Metadata = { title: "Cookies y almacenamiento · Dream" };

export default function Page() {
  return <LegalPage content={cookies} />;
}
