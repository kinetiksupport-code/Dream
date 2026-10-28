import { CookieSettingsButton } from "@/components/cookie-settings-button";
import Link from "next/link";
import { Orb } from "@/components/orb";
import { OrbLink } from "@/components/orb-link";
import { Sticker } from "@/components/sticker";
import { SubjectObject } from "@/components/subject-object";
import s from "./landing.module.css";

// Landing con scroll cinematográfico (docs/diseno/landing-storyboard.md).
// Componente de servidor: el movimiento son CSS scroll-driven animations con
// @supports, sin JavaScript propio. La única isla cliente es OrbLink (el orbe
// viaja al login, lib/orb-transition.ts). Sin soporte o con movimiento
// reducido, cada escena se ve completa y quieta.

const GRADES = ["5", "6", "7", "8", "8,5", "9", "10"];

function Cta({ children = "Probar Dream", tone = "yellow" }: { children?: string; tone?: "yellow" | "blue" }) {
  return (
    <OrbLink className={`button-3d tone-${tone} press ${s.cta}`} href="/login">
      <span className="button-3d-face">{children}</span>
    </OrbLink>
  );
}

export default function LandingPage() {
  return (
    <div className={s.site}>
      <a className="skip-link" href="#main">
        Ir al contenido
      </a>
      <header className={`${s.nav} pop tone-blue`}>
        <Link className={`press ${s.brand}`} href="/">
          <Orb size={32} />
          Dream
        </Link>
        <OrbLink className={`press ${s.navCta}`} href="/login">
          Entrar
        </OrbLink>
      </header>
      <main id="main">
        {/* 1. Héroe */}
        <section className={`${s.scene} ${s.hero} pop tone-blue pop-grid`} aria-labelledby="hero-title">
          <div className={s.heroInner}>
            <span className={s.heroSticker} aria-hidden="true">
              <Sticker shape="round" tone="yellow" size={168} tilt={-6}>
                <Orb size={104} breathing />
              </Sticker>
            </span>
            <h1 id="hero-title" className={`hero-title ${s.heroTitle}`}>
              Saca tu mejor <span className="marker marker-draw">nota</span>.
            </h1>
            <p className={s.lead}>
              Sube tus apuntes, entiende cada tema con pistas y prepárate el examen a tu ritmo.
            </p>
            <div className={s.actions}>
              <Cta />
              <span className={s.note}>Gratis. Entra con Google.</span>
            </div>
          </div>
        </section>

        {/* 2. Sube tus apuntes (momento firma: la foto se convierte en un examen) */}
        <section className={`${s.scene} ${s.notes} pop tone-purple`} aria-labelledby="notes-title">
          <div className={s.notesStage}>
            <div className={s.copy}>
              <span className={s.tag}>
                <Sticker shape="pill" tone="yellow" tilt={-4}>
                  Desde el móvil con QR
                </Sticker>
              </span>
              <h2 id="notes-title" className={`hero-title ${s.sceneTitle}`}>
                Sube tus <span className="marker">apuntes</span>.
              </h2>
              <p className={s.lead}>
                Hazles una foto con el móvil y Dream los convierte en un examen con su ruta de estudio.
              </p>
            </div>
            <div className={s.notesVisual} aria-hidden="true">
              <div className={s.phone}>
                <span className={s.phoneNotch} />
                <div className={s.sheet}>
                  <b>Tema 4 · La célula</b>
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className={s.examCard}>
                <SubjectObject object="microscope" size={56} float={false} />
                <b>Examen de Biología</b>
                <span>4 temas · 12 días</span>
                <span className={s.examReady}>Ruta lista</span>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Entiende, no copies */}
        <section className={`${s.scene} ${s.chat}`} aria-labelledby="chat-title">
          <div className={s.split}>
            <div className={s.copy}>
              <span className={s.tag}>
                <Sticker shape="scalloped" tone="red" size={104} tilt={6}>
                  Sin atajos
                </Sticker>
              </span>
              <h2 id="chat-title" className={`hero-title ${s.sceneTitle}`}>
                Entiende, no <span className="marker">copies</span>.
              </h2>
              <p className={s.lead}>
                Dream no te da el ejercicio resuelto: te da una pista y te pregunta, hasta que lo sacas tú.
              </p>
            </div>
            <ol className={s.bubbles} aria-label="Ejemplo de conversación">
              <li className={s.me}>¿Me haces el ejercicio 4?</li>
              <li className={s.dream}>
                No te lo resuelvo, pero te doy una pista: ¿qué pasa si pasas el 6 al otro lado?
              </li>
              <li className={s.me}>¡Ah! Entonces 2x = 6, y x = 3.</li>
              <li className={s.dream}>Eso es. ¿Probamos uno un poco más difícil?</li>
            </ol>
          </div>
        </section>

        {/* 4. Tests y simulacros */}
        <section className={`${s.scene} ${s.tests} pop tone-orange pop-grid`} aria-labelledby="tests-title">
          <div className={s.split}>
            <div className={s.copy}>
              <h2 id="tests-title" className={`hero-title ${s.sceneTitle}`}>
                Tests y <span className="marker">simulacros</span>.
              </h2>
              <p className={s.lead}>
                Practica con preguntas de tus apuntes, haz simulacros del examen y elige la nota que quieres sacar.
              </p>
            </div>
            <div className={s.testsVisual} aria-hidden="true">
              <div className={s.deck}>
                <div className={s.card}>
                  <small>Pregunta 1</small>
                  <b>¿Qué orgánulo produce la energía de la célula?</b>
                </div>
                <div className={s.card}>
                  <small>Pregunta 2</small>
                  <b>Resuelve: 3x − 5 = 10</b>
                </div>
                <div className={s.card}>
                  <small>Pregunta 3</small>
                  <b>¿En qué año empezó la Revolución francesa?</b>
                </div>
              </div>
              <div className={s.wheel}>
                <ol className={s.wheelRing}>
                  {GRADES.map((g, i) => (
                    <li key={g} style={{ ["--i" as string]: i }}>
                      {g}
                    </li>
                  ))}
                </ol>
                <span className={s.wheelValue}>
                  8,5<small>/ 10</small>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Tu progreso */}
        <section className={`${s.scene} ${s.progress} pop tone-green`} aria-labelledby="progress-title">
          <div className={s.split}>
            <div className={s.copy}>
              <h2 id="progress-title" className={`hero-title ${s.sceneTitle}`}>
                Mira cómo <span className="marker">avanzas</span>.
              </h2>
              <p className={s.lead}>
                Dream te dice cuánto llevas preparado y qué te toca repasar antes del examen.
              </p>
            </div>
            <div className={s.progressCard}>
              <span className={s.example}>Ejemplo</span>
              <SubjectObject object="cap" size={72} float={false} className={s.cap} />
              <p className={s.progressLabel}>Preparación del examen</p>
              <p className={s.bigNumber}>
                <span className="visually-hidden">82 %</span>
                <span className={s.odometer} aria-hidden="true">
                  <span className={s.digit} style={{ ["--to" as string]: 8 }}>
                    {Array.from({ length: 10 }, (_, d) => (
                      <span key={d}>{d}</span>
                    ))}
                  </span>
                  <span className={s.digit} style={{ ["--to" as string]: 2 }}>
                    {Array.from({ length: 10 }, (_, d) => (
                      <span key={d}>{d}</span>
                    ))}
                  </span>
                  <span className={s.pct}>%</span>
                </span>
              </p>
              <span className={s.bar} aria-hidden="true">
                <i />
              </span>
            </div>
          </div>
        </section>

        {/* 6. Gratis */}
        <section className={`${s.scene} ${s.free} pop tone-yellow pop-grid`} aria-labelledby="free-title">
          <div className={s.freeInner}>
            <span className={s.freeSticker} aria-hidden="true">
              <Sticker shape="scalloped" tone="blue" size={128} tilt={8}>
                <Orb size={72} />
              </Sticker>
            </span>
            <h2 id="free-title" className={`hero-title ${s.sceneTitle}`}>
              Dream es <span className="marker">gratis</span>.
            </h2>
            <p className={s.lead}>Sin tarjeta ni suscripción. Aprender mejor no debería depender de cuánto puedas pagar.</p>
            <Cta tone="blue" />
          </div>
        </section>
      </main>
      <footer className={s.footer}>
        <span>
          <Orb size={20} /> Dream © 2026
        </span>
        <nav aria-label="Legal">
          <Link href="/privacidad">Privacidad</Link>
          <Link href="/terminos">Términos</Link>
          <Link href="/cookies">Cookies</Link>
          <Link href="/aviso-legal">Aviso legal</Link>
          <CookieSettingsButton className={s.footerButton} />
        </nav>
      </footer>
    </div>
  );
}
