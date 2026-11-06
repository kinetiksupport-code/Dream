import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { sobreNosotros } from "@/content/sobre-nosotros";
import { SITE_URL } from "@/lib/seo";

const DESCRIPTION =
  "Dream Education la fundó en 2026 Carlos Sánchez, un joven emprendedor de Sevilla, para ayudar a más alumnos a sacar la máxima nota en sus exámenes.";

export const metadata: Metadata = {
  title: "Sobre nosotros · Dream",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/sobre-nosotros` },
};

export default function Page() {
  return <LegalPage content={sobreNosotros} />;
}
