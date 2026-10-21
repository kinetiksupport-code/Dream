import Link from "next/link";
import { Orb } from "@/components/orb";

/**
 * La página 404 de Dream. La usa app/not-found.tsx y también el panel de
 * administración mientras no confirma que quien mira es el administrador, para
 * que nadie pueda distinguir esa ruta de una que no existe.
 */
export function NotFoundView() {
  return (
    <main className="boot">
      <div className="status-page">
        <Orb size={56} />
        <p className="eyebrow">Error 404</p>
        <h1>No encontramos esta página</h1>
        <p>Puede que el enlace haya cambiado o ya no exista.</p>
        <Link className="primary press" href="/chat">
          Volver a Dream
        </Link>
      </div>
    </main>
  );
}
