import type { Metadata } from "next";
import { MobileUpload } from "@/components/upload/mobile-upload";

// Private, per-request page: never prerendered or cached. Headers
// (no-store, no-referrer, noindex) are also set in middleware.ts.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Subir apuntes",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function UploadFromPhonePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <MobileUpload token={token} />;
}
