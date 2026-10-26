"use client";

import { Caveat, Nunito } from "next/font/google";
import katex from "katex";
import { ArrowRight, BookOpen, CalendarDays, Landmark, Lightbulb, PenLine, TriangleAlert } from "lucide-react";
import { Fragment, useMemo, type ReactNode } from "react";
import { layoutScheme, parseBold, type Scheme, type SchemeCard } from "@/lib/esquema";
import styles from "./esquema.module.css";

// Autoalojadas por next/font en el build (no se pide nada a Google al ver la página).
const rounded = Nunito({ subsets: ["latin", "latin-ext"], weight: ["700", "800", "900"], variable: "--esq-rounded", display: "swap" });
const hand = Caveat({ subsets: ["latin", "latin-ext"], weight: ["600", "700"], variable: "--esq-hand", display: "swap" });

const KIND_ICON = { examples: PenLine, mistakes: TriangleAlert, legacy: Landmark, dates: CalendarDays } as const;

function Rich({ text }: { text: string }) {
  return (
    <>
      {parseBold(text).map((part, i) => (part.bold ? <strong key={i}>{part.text}</strong> : <Fragment key={i}>{part.text}</Fragment>))}
    </>
  );
}

function Bullets({ items }: { items: { text: string }[] }) {
  return (
    <ul className={styles.bullets}>
      {items.map((b, i) => (
        <li key={i}>
          <Rich text={b.text} />
        </li>
      ))}
    </ul>
  );
}

function Formula({ tex }: { tex: string }) {
  // KaTeX escapa el texto y con trust:false no admite \href ni HTML propio.
  const html = useMemo(() => katex.renderToString(tex, { throwOnError: false, displayMode: true, trust: false, strict: "ignore" }), [tex]);
  return <div className={styles.formula} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Ilustración local (sin IA): paisaje suave en los tonos de la tarjeta. */
function LocalScene({ seed }: { seed: number }) {
  const sunX = 60 + ((seed * 47) % 200);
  return (
    <svg viewBox="0 0 320 150" aria-hidden="true" className={styles.scene}>
      <rect width="320" height="150" className={styles.sceneSky} />
      <circle cx={sunX} cy="58" r="26" className={styles.sceneSun} />
      <path d={`M0 110 Q ${70 + (seed % 3) * 20} 70 160 100 T 320 92 V150 H0Z`} className={styles.sceneHillBack} />
      <path d={`M0 128 Q 90 ${96 + (seed % 4) * 4} 190 122 T 320 116 V150 H0Z`} className={styles.sceneHillFront} />
    </svg>
  );
}

function Illustration({ card, src }: { card: SchemeCard; src?: string }) {
  return (
    <figure className={styles.illustration}>
      {src ? (
        // Imagen generada con IA, guardada en Storage (Bloque 5). Decorativa: el texto está en la tarjeta.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" />
      ) : (
        <LocalScene seed={card.number} />
      )}
      {src ? <figcaption className={styles.aiTag}>Imagen generada con IA</figcaption> : null}
    </figure>
  );
}

function CardBody({ card }: { card: SchemeCard }) {
  if (card.kind === "dates" && card.dates.length) {
    return (
      <>
        <table className={styles.dates}>
          <caption className={styles.srOnly}>{card.heading}</caption>
          <tbody>
            {card.dates.map((d, i) => (
              <tr key={i}>
                <th scope="row">
                  <span className={styles.pill} data-alt={i % 2 === 1 || undefined}>
                    {d.year}
                  </span>
                </th>
                <td>
                  <Rich text={d.text} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {card.bullets.length ? <Bullets items={card.bullets} /> : null}
      </>
    );
  }
  return (
    <>
      {card.formula ? <Formula tex={card.formula} /> : null}
      {card.bullets.length ? <Bullets items={card.bullets} /> : null}
      {card.subcards.length ? (
        <div className={styles.subcards}>
          {card.subcards.map((sub, i) => (
            <section key={i} className={styles.subcard}>
              <h4>{sub.title}</h4>
              <Bullets items={sub.bullets} />
            </section>
          ))}
        </div>
      ) : null}
    </>
  );
}

function Card({ card, illustration }: { card: SchemeCard; illustration?: string }) {
  const Icon = KIND_ICON[card.kind as keyof typeof KIND_ICON];
  return (
    <section className={styles.card} data-tone={card.tone} style={{ order: card.number }} aria-labelledby={`esq-h-${card.number}`}>
      <header className={styles.cardHead}>
        <span className={styles.number} aria-hidden="true">
          {card.number}
        </span>
        <h3 id={`esq-h-${card.number}`}>
          <span className={styles.srOnly}>{card.number}. </span>
          {card.heading}
        </h3>
        {Icon ? <Icon className={styles.kindIcon} aria-hidden="true" /> : null}
      </header>
      <CardBody card={card} />
      {card.illustration ? <Illustration card={card} src={illustration} /> : null}
    </section>
  );
}

function HandUnderline() {
  return (
    <svg className={styles.underline} viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
      <path d="M3 8 C 50 2, 110 12, 197 5" />
    </svg>
  );
}

/**
 * Esquema visual. `illustrations` lleva las URL de las ilustraciones por
 * número de tarjeta; sin ellas se dibujan las locales.
 */
export function EsquemaView({ scheme, illustrations = {}, footer }: { scheme: Scheme; illustrations?: Record<number, string>; footer?: ReactNode }) {
  const layout = useMemo(() => layoutScheme(scheme, 3), [scheme]);
  return (
    <article className={`${styles.esquema} ${rounded.variable} ${hand.variable}`} lang="es">
      <header className={styles.head}>
        {scheme.subject ? (
          <p className={styles.eyebrow}>
            <BookOpen aria-hidden="true" /> {scheme.subject}
          </p>
        ) : null}
        <h2 className={styles.title}>{scheme.title}</h2>
        {scheme.subtitle ? <p className={styles.subtitle}>{scheme.subtitle}</p> : null}
      </header>

      <div className={styles.grid}>
        {layout.columns.map((column, c) => (
          <div key={c} className={styles.column}>
            {column.map((index) => (
              <Card key={index} card={layout.cards[index]} illustration={illustrations[layout.cards[index].number]} />
            ))}
          </div>
        ))}
      </div>

      {scheme.key_ideas.length || scheme.summary ? (
        <div className={styles.bottom}>
          {scheme.key_ideas.length ? (
            <section className={styles.ideas} aria-labelledby="esq-ideas">
              <h3 id="esq-ideas">
                <Lightbulb aria-hidden="true" /> Ideas clave
              </h3>
              <ul>
                {scheme.key_ideas.map((idea, i) => (
                  <li key={i}>
                    <Rich text={idea} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {scheme.summary ? (
            <section className={styles.summary} aria-labelledby="esq-resumen">
              <h3 id="esq-resumen">
                En resumen
                <HandUnderline />
              </h3>
              <p>
                <Rich text={scheme.summary} />
              </p>
            </section>
          ) : null}
        </div>
      ) : null}

      {scheme.closing ? (
        <p className={styles.closing}>
          <ArrowRight aria-hidden="true" />
          <span>
            <Rich text={scheme.closing} />
          </span>
        </p>
      ) : null}

      <footer className={styles.foot}>
        <span>Contenido generado por IA, revísalo.</span>
        {footer}
      </footer>
    </article>
  );
}
