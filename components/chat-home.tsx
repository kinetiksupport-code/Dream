"use client";
import Link from "next/link";
import {
  BookOpen,
  ScanLine,
  ListChecks,
  ArrowUpRight,
  Sigma,
  Type,
  Paperclip,
  Globe,
  ArrowRight,
} from "lucide-react";
import { DreamMark } from "./dream-mark";
import { useConversations } from "./shell";
export function ChatHome({
  onPrompt,
  onAttach,
}: {
  onPrompt: (prompt: string) => void;
  onAttach: () => void;
}) {
  const { items } = useConversations();
  return (
    <div className="home-content">
      <div className="home-hero">
        <p className="eyebrow">TU CURIOSIDAD, SIN LÍMITES</p>
        <h1>
          ¿Qué quieres
          <br />
          <mark>entender?</mark>
        </h1>
        <p className="home-subtitle">
          No necesitas saber por dónde empezar. Para eso estamos.
        </p>
        <DreamMark size={64} />
      </div>
      <div className="home-columns">
        <div className="home-actions">
          <div className="quick-actions">
            <button
              className="quick-action action-blue"
              onClick={() =>
                onPrompt("Quiero aprender algo nuevo. ¿Por dónde empezamos?")
              }
            >
              <span className="quick-icons">
                <BookOpen size={22} />
                <ArrowUpRight size={16} />
              </span>
              <strong>Aprender algo</strong>
              <small className="mobile-copy">De la duda al clic.</small>
              <small className="desktop-copy">
                Una explicación que haga clic.
              </small>
            </button>
            <button
              className="quick-action action-lime"
              onClick={() =>
                onPrompt("Ayúdame a resolver este problema paso a paso: ")
              }
            >
              <span className="quick-icons">
                <ScanLine size={22} />
                <ArrowUpRight size={16} />
              </span>
              <strong>Resolver un problema</strong>
              <small className="mobile-copy">Paso a paso, contigo.</small>
              <small className="desktop-copy">Entiende cada paso.</small>
            </button>
            <button
              className="quick-action action-practice"
              onClick={() =>
                onPrompt(
                  "Quiero practicar. Ayúdame a elegir un tema para un test.",
                )
              }
            >
              <span className="quick-icons">
                <ListChecks size={22} />
                <ArrowUpRight size={16} />
              </span>
              <strong>Practicar</strong>
              <small className="mobile-copy">Ponte a prueba</small>
              <small className="desktop-copy">
                Llega al examen con confianza.
              </small>
            </button>
          </div>
          <div className="home-tools">
            <button
              onClick={() =>
                onPrompt("Quiero entender mejor este concepto de matemáticas: ")
              }
            >
              <Sigma size={20} />
              <span>Matemáticas</span>
            </button>
            <button
              onClick={() => onPrompt("Ayúdame con una duda de lengua: ")}
            >
              <Type size={20} />
              <span>Lengua</span>
            </button>
            <button onClick={onAttach}>
              <Paperclip size={20} />
              <span>Analizar archivo</span>
            </button>
            <button
              onClick={() =>
                onPrompt("Busca en Internet información actual sobre ")
              }
            >
              <Globe size={20} />
              <span>Buscar en Internet</span>
            </button>
          </div>
        </div>
        <aside className="home-personal">
          <section>
            <p className="eyebrow">ESTA SEMANA</p>
            <h2>A tu ritmo.</h2>
            <p>Cada buena pregunta es un paso más.</p>
            <Link href="/progress">
              Ver mi progreso <ArrowRight size={14} />
            </Link>
          </section>
          <section>
            <p className="eyebrow">RETOMA EL HILO</p>
            {items.length ? (
              items.slice(0, 3).map((c) => (
                <Link
                  className="home-recent"
                  href={`/chat?c=${c.id}`}
                  key={c.id}
                >
                  <strong>{c.title}</strong>
                  <small>
                    {new Date(c.updated_at).toLocaleDateString("es", {
                      day: "numeric",
                      month: "short",
                    })}
                  </small>
                </Link>
              ))
            ) : (
              <p>Tus conversaciones aparecerán aquí.</p>
            )}
            <Link href="/chat?view=recent">
              Todos los recientes <ArrowRight size={14} />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
