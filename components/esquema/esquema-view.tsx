"use client";

import { Baloo_2, Caveat } from "next/font/google";
import katex from "katex";
import { ArrowRight, BookOpen, Landmark, Lightbulb, PenLine, TriangleAlert } from "lucide-react";
import { Fragment, useMemo, type ReactNode } from "react";
import { layoutScheme, parseInline, PILL_TONES, SUBCARD_TONES, type Scheme, type SchemeBlock, type SchemeCard } from "@/lib/esquema";
import styles from "./esquema.module.css";

// Autoalojadas por next/font en el build (no se pide nada a Google al ver la página).
const display = Baloo_2({ subsets: ["latin", "latin-ext"], weight: ["600", "700", "800"], variable: "--esq-display", display: "swap" });
const hand = Caveat({ subsets: ["latin", "latin-ext"], weight: ["500", "600", "700"], variable: "--esq-hand", display: "swap" });

const KIND_ICON = { examples: PenLine, mistakes: TriangleAlert, legacy: Landmark } as const;

function InlineMath({ tex }: { tex: string }) {
  // KaTeX escapa el texto y con trust:false no admite \href ni HTML propio.
  const html = useMemo(() => katex.renderToString(tex, { throwOnError: false, displayMode: false, trust: false, strict: "ignore" }), [tex]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function Rich({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((part, i) =>
        part.math ? <InlineMath key={i} tex={part.text} /> : part.bold ? <strong key={i}>{part.text}</strong> : <Fragment key={i}>{part.text}</Fragment>,
      )}
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
      <circle cx={sunX} cy="58" r="26" className={styles.sceneSun} />
      <path d={`M0 110 Q ${70 + (seed % 3) * 20} 70 160 100 T 320 92 V150 H0Z`} className={styles.sceneHillBack} />
      <path d={`M0 128 Q 90 ${96 + (seed % 4) * 4} 190 122 T 320 116 V150 H0Z`} className={styles.sceneHillFront} />
    </svg>
  );
}

function Illustration({ card, src }: { card: SchemeCard; src?: string }) {
  return (
    <figure className={styles.illustration}>
      <div className={styles.illustrationFrame}>
        {src ? (
          // Imagen generada con IA, guardada en Storage (Bloque 5). Decorativa: el texto está en la tarjeta.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" loading="lazy" decoding="async" />
        ) : (
          <LocalScene seed={card.heading.length} />
        )}
        {src ? <span className={styles.aiTag}>Imagen generada con IA</span> : null}
      </div>
      {card.illustration_caption ? <figcaption>{card.illustration_caption}</figcaption> : null}
    </figure>
  );
}

function Heading({ id, children, number, icon, period }: { id: string; children: ReactNode; number?: number | null; icon?: ReactNode; period?: string }) {
  return (
    <header className={styles.cardHead}>
      {number ? (
        <span className={styles.number} aria-hidden="true">
          {number}
        </span>
      ) : (
        icon
      )}
      <h3 id={id}>
        {number ? <span className={styles.srOnly}>{number}. </span> : null}
        {children}
        {period ? <span className={styles.period}> ({period})</span> : null}
      </h3>
    </header>
  );
}

function SectionCard({ card, index, illustration }: { card: SchemeCard; index: number; illustration?: string }) {
  const Icon = KIND_ICON[card.kind as keyof typeof KIND_ICON];
  const id = `esq-h-${index}`;
  const callout = card.closing ? (
    <p className={styles.callout}>
      <ArrowRight aria-hidden="true" />
      <span>
        <Rich text={card.closing} />
      </span>
    </p>
  ) : null;
  return (
    <section className={styles.card} data-tone={card.tone} aria-labelledby={id}>
      <Heading id={id} number={card.number} period={card.period} icon={Icon ? <Icon className={styles.headIcon} aria-hidden="true" /> : null}>
        {card.heading}
      </Heading>
      <div className={styles.cardBody}>
        {card.intro ? (
          <p className={styles.intro}>
            <Rich text={card.intro} />
          </p>
        ) : null}
        {card.formula ? <Formula tex={card.formula} /> : null}
        {card.dates.length ? (
          <table className={styles.dates}>
            <caption className={styles.srOnly}>{card.heading}</caption>
            <tbody>
              {card.dates.map((d, i) => (
                <tr key={i}>
                  <th scope="row">
                    <span className={styles.pill} data-tone={PILL_TONES[i % PILL_TONES.length]}>
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
        ) : null}
        {card.bullets.length ? <Bullets items={card.bullets} /> : null}
        {card.subcards.length ? (
          <div className={styles.subcards} data-count={card.subcards.length}>
            {card.subcards.map((sub, i) => (
              <section key={i} className={styles.subcard} data-tone={SUBCARD_TONES[i % SUBCARD_TONES.length]}>
                <h4>
                  {sub.title}
                  {sub.period ? <span className={styles.period}> ({sub.period})</span> : null}
                </h4>
                <Bullets items={sub.bullets} />
              </section>
            ))}
          </div>
        ) : null}
        {card.highlight ? (
          <p className={styles.highlight}>
            <Rich text={card.highlight} />
          </p>
        ) : null}
        {card.illustration && callout ? (
          <div className={styles.calloutRow}>
            {callout}
            <Illustration card={card} src={illustration} />
          </div>
        ) : (
          <>
            {callout}
            {card.illustration ? <Illustration card={card} src={illustration} /> : null}
          </>
        )}
      </div>
    </section>
  );
}

function Block({ block, index, illustrations }: { block: SchemeBlock; index: number; illustrations: Record<string, string> }) {
  if (block.type === "section") return <SectionCard card={block.card} index={index} illustration={illustrations[block.card.heading]} />;
  if (block.type === "ideas")
    return (
      <section className={styles.card} data-tone="verde" aria-labelledby="esq-ideas">
        <Heading id="esq-ideas" icon={<Lightbulb className={styles.headIcon} aria-hidden="true" />}>
          Ideas clave
        </Heading>
        <div className={styles.cardBody}>
          <Bullets items={block.ideas.map((text) => ({ text }))} />
        </div>
      </section>
    );
  return (
    <section className={`${styles.card} ${styles.summary}`} data-tone="lila" aria-labelledby="esq-resumen">
      <div className={styles.summaryHead}>
        <BookOpen className={styles.summaryIcon} aria-hidden="true" />
        <h3 id="esq-resumen">En resumen:</h3>
      </div>
      <p>
        <Rich text={block.text} />
      </p>
      <svg className={styles.squiggle} viewBox="0 0 200 14" aria-hidden="true">
        <path d="M4 9 C 40 3, 70 13, 110 7 S 170 4, 196 8" />
      </svg>
    </section>
  );
}

/**
 * Esquema visual. `illustrations` lleva las URL de las ilustraciones por
 * título de sección; sin ellas se dibujan las locales.
 */
export function EsquemaView({ scheme, illustrations = {}, footer }: { scheme: Scheme; illustrations?: Record<string, string>; footer?: ReactNode }) {
  const layout = useMemo(() => layoutScheme(scheme, 3), [scheme]);
  return (
    <article className={`${styles.esquema} ${display.variable} ${hand.variable}`} lang="es">
      <header className={styles.head}>
        {scheme.subject ? <p className={styles.srOnly}>{scheme.subject}</p> : null}
        <h2 className={styles.title}>{scheme.title}</h2>
        {scheme.subtitle ? <p className={styles.subtitle}>{scheme.subtitle}</p> : null}
      </header>

      <div className={styles.grid}>
        {layout.columns.map((column, c) => (
          <div key={c} className={styles.column}>
            {column.map((index) => (
              <div key={index} className={styles.slot} style={{ order: index }}>
                <Block block={layout.blocks[index]} index={index} illustrations={illustrations} />
              </div>
            ))}
          </div>
        ))}
      </div>

      <footer className={styles.foot}>
        <span>Contenido generado por IA, revísalo.</span>
        {footer}
      </footer>
    </article>
  );
}
