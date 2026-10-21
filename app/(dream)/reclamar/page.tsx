import type { Metadata } from "next";
import Link from "next/link";
import { AppealForm } from "@/components/moderation/appeal-form";

export const metadata: Metadata = { title: "Reclamar" };

/** «Reclamar»: abierta para quien tenga una limitación o un bloqueo y crea que es un error. */
export default function Reclamar() {
  return (
    <div className="page page-settings">
      <h1 className="title">Reclamar</h1>
      <p className="page-intro">
        Si crees que una limitación, un aviso o un bloqueo es un error, cuéntanoslo. Lo revisa una persona y te respondemos en un máximo de 30 días. Si nos equivocamos, lo quitamos.
      </p>
      <AppealForm />
      <p>
        <Link className="text-link" href="/chat">
          Volver a Dream
        </Link>
      </p>
    </div>
  );
}
