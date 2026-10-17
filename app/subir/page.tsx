import type { Metadata } from "next";
import { MobileUpload } from "@/components/upload/mobile-upload";

// /subir#<token>: the token lives in the URL fragment, which browsers never
// send to a server, so it stays out of Vercel's request logs. The page reads
// it on the phone, wipes it from the address bar and sends it in the body.
// Headers (no-store, no-referrer, noindex) are also set in middleware.ts.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Subir apuntes",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function UploadFromPhonePage() {
  return <MobileUpload />;
}
