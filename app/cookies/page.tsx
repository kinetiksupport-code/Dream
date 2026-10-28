import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { CookieDeclaration } from "@/components/cookie-declaration";
import { cookies } from "@/content/legal/cookies";

export const metadata: Metadata = { title: "Política de cookies · Dream" };

export default function Page() {
  return (
    <LegalPage content={cookies}>
      <CookieDeclaration />
    </LegalPage>
  );
}
