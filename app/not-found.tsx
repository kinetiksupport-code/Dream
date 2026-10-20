import Link from "next/link";
import { Orb } from "@/components/orb";
export default function NotFound() {
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
