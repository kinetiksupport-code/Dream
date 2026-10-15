import Link from "next/link";
import { Orb } from "@/components/orb";
export default function Progress() {
  return (
    <div className="page page-narrow">
      <h1 className="title">Progreso</h1>
      <div className="empty-state">
        <Orb size={48} />
        <h2>Tu camino, a tu ritmo</h2>
        <p>
          Dream conserva los conceptos practicados y los resultados de tus tests
          para adaptar las próximas conversaciones. Aquí verás ese historial
          cuando el servicio permita consultarlo.
        </p>
        <Link className="secondary press" href="/chat">
          Volver a Dream
        </Link>
      </div>
    </div>
  );
}
