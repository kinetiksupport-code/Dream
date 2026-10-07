import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DreamMark } from "@/components/dream-mark";
export default function Progress() {
  return (
    <div className="personal-page progress-page">
      <p className="eyebrow">CADA IDEA CUENTA</p>
      <h1>
        Mira cuánto
        <br />
        <span>has avanzado.</span>
      </h1>
      <p className="page-intro">
        Lo que practicas hoy ayuda a Dream a acompañarte mañana.
      </p>
      <div className="progress-empty">
        <DreamMark large />
        <h2>Tu camino, a tu ritmo.</h2>
        <p>
          Dream conserva los conceptos practicados y los resultados de tus tests
          para adaptar las próximas conversaciones.
        </p>
        <p className="muted">
          La consulta de ese historial todavía no está disponible. Aquí
          aparecerán tus conceptos y tests cuando el servicio permita
          consultarlos.
        </p>
        <Link className="text-link" href="/chat">
          Volver a mi Dream
          <ArrowUpRight size={17} />
        </Link>
      </div>
    </div>
  );
}
