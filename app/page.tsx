import Link from "next/link";
import { Orb } from "@/components/orb";
import s from "./landing.module.css";

// Server component: no client JS for the public landing (LCP).
export default function LandingPage() {
  return (
    <div className={s.site}>
      <header className={s.nav}>
        <Link className={s.brand} href="/">
          <Orb size={32} />
          Dream
        </Link>
        <Link className={`primary press ${s.navCta}`} href="/login">
          Entrar
        </Link>
      </header>
      <main id="main">
        <section className={s.hero}>
          <Orb size={72} className="rise" />
          <h1 className={`${s.heroTitle} rise rise-1`}>
            No es magia. Es tu mente amplificada.
          </h1>
          <p className={`${s.heroCopy} rise rise-2`}>
            Aprende, pregunta, investiga y trabaja con tus propios archivos.
            Dream no está aquí para pensar por ti, sino para ayudarte a entender
            mejor.
          </p>
          <div className={`${s.actions} rise rise-2`}>
            <Link className={`primary press ${s.cta}`} href="/login">
              Probar Dream
            </Link>
            <span className={s.note}>Gratis. Entra con Google.</span>
          </div>
        </section>
        <section className={s.features} aria-labelledby="features-title">
          <h2 id="features-title" className="visually-hidden">
            Qué hace Dream
          </h2>
          <article>
            <h3>Entiende, no memorices.</h3>
            <p>
              Dream adapta la explicación a lo que necesitas y avanza contigo,
              paso a paso, sin soltarte una respuesta enorme y desaparecer.
            </p>
          </article>
          <article>
            <h3>Tráelo a Dream.</h3>
            <p>PDF, Word, Excel, apuntes o código. Súbelo y pregunta.</p>
          </article>
          <article>
            <h3>No solo lo leas. Pruébalo.</h3>
            <p>Dream convierte lo que estudias en tests interactivos.</p>
          </article>
          <article>
            <h3>Cuando importa, busca.</h3>
            <p>
              Si una respuesta depende de información reciente, Dream consulta
              la web antes de responder.
            </p>
          </article>
        </section>
        <section className={s.pricing} aria-labelledby="pricing-title">
          <p>Aprender mejor no debería depender de cuánto puedas pagar.</p>
          <h2 id="pricing-title">Dream es gratis.</h2>
          <p>
            Pregunta. Aprende. Practica. Vuelve mañana. Sin tarjeta ni
            suscripción.
          </p>
          <Link className={`primary press ${s.cta}`} href="/login">
            Probar Dream
          </Link>
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
        </nav>
      </footer>
    </div>
  );
}
