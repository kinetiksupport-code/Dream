"use client";

import { Baloo_2, Caveat } from "next/font/google";
import katex from "katex";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Landmark,
  Lightbulb,
  Minus,
  PenLine,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { createContext, Fragment, useContext, useMemo, type ReactNode } from "react";
import {
  ALL_TONES,
  layoutScheme,
  parseInline,
  PILL_TONES,
  SUBCARD_TONES,
  type Scheme,
  type SchemeBlock,
  type SchemeCard,
  type Tone,
} from "@/lib/esquema";
import styles from "./esquema.module.css";

// Autoalojadas por next/font en el build (no se pide nada a Google al ver la página).
const display = Baloo_2({ subsets: ["latin", "latin-ext"], weight: ["600", "700", "800"], variable: "--esq-display", display: "swap" });
const hand = Caveat({ subsets: ["latin", "latin-ext"], weight: ["500", "600", "700"], variable: "--esq-hand", display: "swap" });

const KIND_ICON = { examples: PenLine, mistakes: TriangleAlert, legacy: Landmark } as const;
const TONE_NAME: Record<Tone, string> = {
  amarillo: "Amarillo",
  azul: "Azul",
  rojo: "Rojo",
  indigo: "Índigo",
  celeste: "Celeste",
  naranja: "Naranja",
  verde: "Verde",
  lila: "Lila",
};

/** Ruta a un texto dentro del esquema: ["sections", 0, "bullets", 2, "text"]. */
export type SchemePath = (string | number)[];
/** Lo que la pantalla de edición (esquema-page.tsx) ofrece a la vista. */
export interface SchemeEditApi {
  set(path: SchemePath, value: string): void;
  /** Añade `item` al final de la lista en `path`. */
  insert(path: SchemePath, item: unknown): void;
  remove(path: SchemePath): void;
  move(section: number, delta: -1 | 1): void;
  tone(section: number, tone: Tone): void;
  refine(section: number, mode: "ampliar" | "simplificar"): void;
  /** Tarjeta que la IA está rehaciendo. */
  refining: number | null;
  sections: number;
}
const EditContext = createContext<SchemeEditApi | null>(null);

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

/**
 * Texto del esquema. Al editar, el mismo texto se toca y se escribe en su
 * sitio (contentEditable, solo texto plano); `**así**` es negrita.
 */
function T({ value, path, label, multiline = false }: { value: string; path: SchemePath; label: string; multiline?: boolean }) {
  const edit = useContext(EditContext);
  if (!edit) return <Rich text={value} />;
  return (
    <span
      className={styles.editable}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={label}
      aria-multiline={multiline}
      tabIndex={0}
      spellCheck
      onFocus={(e) => {
        // Móvil: que el teclado no tape el texto que se escribe.
        const el = e.currentTarget;
        window.setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 250);
      }}
      onPaste={(e) => {
        e.preventDefault();
        document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !multiline) {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          e.currentTarget.textContent = value;
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        const text = (e.currentTarget.textContent ?? "").replace(/\s+/g, " ").trim();
        if (text !== value) edit.set(path, text);
      }}
    >
      {value}
    </span>
  );
}

function IconButton({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className={`${styles.iconButton} press`} aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={`${styles.addButton} press`} onClick={onClick}>
      <Plus size={16} aria-hidden="true" /> {label}
    </button>
  );
}

function Bullets({ items, path }: { items: { text: string }[]; path: SchemePath }) {
  const edit = useContext(EditContext);
  return (
    <>
      <ul className={styles.bullets}>
        {items.map((b, i) => (
          <li key={`${i}-${items.length}`}>
            <T value={b.text} path={[...path, i, "text"]} label={`Viñeta ${i + 1}`} multiline />
            {edit ? (
              <IconButton label={`Quitar viñeta ${i + 1}`} onClick={() => edit.remove([...path, i])}>
                <X size={16} aria-hidden="true" />
              </IconButton>
            ) : null}
          </li>
        ))}
      </ul>
      {edit ? <AddButton label="Viñeta" onClick={() => edit.insert(path, { text: "Nueva viñeta", quote: "" })} /> : null}
    </>
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
          // Imagen generada con IA, guardada en Storage (tanda 2). Decorativa: el texto está en la tarjeta.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" loading="lazy" decoding="async" crossOrigin="anonymous" />
        ) : (
          <LocalScene seed={card.heading.length} />
        )}
        {src ? <span className={styles.aiTag}>Imagen generada con IA</span> : null}
      </div>
      {card.illustration_caption ? (
        <figcaption>
          <T value={card.illustration_caption} path={["sections", card.index, "illustration_caption"]} label="Pie de foto" />
        </figcaption>
      ) : null}
    </figure>
  );
}

function Heading({ id, children, number, icon, period }: { id: string; children: ReactNode; number?: number | null; icon?: ReactNode; period?: ReactNode }) {
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

/** Barra de la tarjeta al editar: mover, color, «Pedir a la IA» y borrar. */
function CardTools({ card }: { card: SchemeCard }) {
  const edit = useContext(EditContext);
  if (!edit) return null;
  const i = card.index;
  const busy = edit.refining === i;
  return (
    <div className={styles.cardTools} role="group" aria-label={`Editar la tarjeta «${card.heading}»`}>
      <IconButton label="Subir tarjeta" onClick={() => edit.move(i, -1)} disabled={i === 0}>
        <ArrowUp size={16} aria-hidden="true" />
      </IconButton>
      <IconButton label="Bajar tarjeta" onClick={() => edit.move(i, 1)} disabled={i === edit.sections - 1}>
        <ArrowDown size={16} aria-hidden="true" />
      </IconButton>
      <span className={styles.swatches} role="radiogroup" aria-label="Color de la tarjeta">
        {ALL_TONES.map((tone) => (
          <button
            key={tone}
            type="button"
            role="radio"
            aria-checked={card.tone === tone}
            aria-label={TONE_NAME[tone]}
            title={TONE_NAME[tone]}
            className={styles.swatch}
            data-tone={tone}
            onClick={() => edit.tone(i, tone)}
          />
        ))}
      </span>
      <button type="button" className={`${styles.aiButton} press`} disabled={busy} onClick={() => edit.refine(i, "ampliar")}>
        <Sparkles size={15} aria-hidden="true" /> {busy ? "Pensando…" : "Ampliar"}
      </button>
      <button type="button" className={`${styles.aiButton} press`} disabled={busy} onClick={() => edit.refine(i, "simplificar")}>
        <Minus size={15} aria-hidden="true" /> Simplificar
      </button>
      <IconButton
        label="Borrar tarjeta"
        disabled={edit.sections <= 1}
        onClick={() => {
          if (window.confirm(`¿Borrar la tarjeta «${card.heading}»? Puedes deshacerlo.`)) edit.remove(["sections", i]);
        }}
      >
        <Trash2 size={16} aria-hidden="true" />
      </IconButton>
    </div>
  );
}

function SectionCard({ card, illustration }: { card: SchemeCard; illustration?: string }) {
  const edit = useContext(EditContext);
  const Icon = KIND_ICON[card.kind as keyof typeof KIND_ICON];
  const i = card.index;
  const base: SchemePath = ["sections", i];
  const id = `esq-h-${i}`;
  const callout = card.closing ? (
    <p className={styles.callout}>
      <ArrowRight aria-hidden="true" />
      <span>
        <T value={card.closing} path={["closing"]} label="Frase de cierre" multiline />
      </span>
    </p>
  ) : null;
  return (
    <section className={styles.card} data-tone={card.tone} aria-labelledby={id} aria-busy={edit?.refining === i || undefined}>
      <CardTools card={card} />
      <Heading
        id={id}
        number={card.number}
        period={card.period || edit ? <T value={card.period} path={[...base, "period"]} label="Periodo" /> : null}
        icon={Icon ? <Icon className={styles.headIcon} aria-hidden="true" /> : null}
      >
        <T value={card.heading} path={[...base, "heading"]} label="Título de la tarjeta" />
      </Heading>
      <div className={styles.cardBody}>
        {card.intro || edit ? (
          <p className={styles.intro}>
            <T value={card.intro} path={[...base, "intro"]} label="Introducción" multiline />
          </p>
        ) : null}
        {card.formula ? (
          edit ? (
            <p className={styles.formulaEdit}>
              <T value={card.formula} path={[...base, "formula"]} label="Fórmula (LaTeX)" />
            </p>
          ) : (
            <Formula tex={card.formula} />
          )
        ) : null}
        {card.dates.length || (edit && card.kind === "dates") ? (
          <>
            <table className={styles.dates}>
              <caption className={styles.srOnly}>{card.heading}</caption>
              <tbody>
                {card.dates.map((d, j) => (
                  <tr key={`${j}-${card.dates.length}`}>
                    <th scope="row">
                      <span className={styles.pill} data-tone={PILL_TONES[j % PILL_TONES.length]}>
                        <T value={d.year} path={[...base, "dates", j, "year"]} label={`Año ${j + 1}`} />
                      </span>
                    </th>
                    <td>
                      <T value={d.text} path={[...base, "dates", j, "text"]} label={`Hecho ${j + 1}`} multiline />
                      {edit ? (
                        <IconButton label={`Quitar fecha ${j + 1}`} onClick={() => edit.remove([...base, "dates", j])}>
                          <X size={16} aria-hidden="true" />
                        </IconButton>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {edit ? <AddButton label="Fecha" onClick={() => edit.insert([...base, "dates"], { year: "Año", text: "Qué pasó", quote: "" })} /> : null}
          </>
        ) : null}
        {card.bullets.length || (edit && !card.subcards.length && !card.dates.length) ? <Bullets items={card.bullets} path={[...base, "bullets"]} /> : null}
        {card.subcards.length ? (
          <div className={styles.subcards} data-count={card.subcards.length}>
            {card.subcards.map((sub, k) => (
              <section key={`${k}-${card.subcards.length}`} className={styles.subcard} data-tone={SUBCARD_TONES[k % SUBCARD_TONES.length]}>
                <h4>
                  <T value={sub.title} path={[...base, "subcards", k, "title"]} label="Título de la subtarjeta" />
                  {sub.period || edit ? (
                    <span className={styles.period}>
                      {" "}
                      (<T value={sub.period} path={[...base, "subcards", k, "period"]} label="Periodo de la subtarjeta" />)
                    </span>
                  ) : null}
                </h4>
                <Bullets items={sub.bullets} path={[...base, "subcards", k, "bullets"]} />
              </section>
            ))}
          </div>
        ) : null}
        {card.highlight ? (
          <p className={styles.highlight}>
            <T value={card.highlight} path={[...base, "highlight"]} label="Destacado" multiline />
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

function Block({ block, illustrations }: { block: SchemeBlock; illustrations: Record<string, string> }) {
  const edit = useContext(EditContext);
  if (block.type === "section") return <SectionCard card={block.card} illustration={block.card.illustration_prompt ? illustrations[block.card.illustration_prompt] : undefined} />;
  if (block.type === "ideas")
    return (
      <section className={styles.card} data-tone="verde" aria-labelledby="esq-ideas">
        <Heading id="esq-ideas" icon={<Lightbulb className={styles.headIcon} aria-hidden="true" />}>
          Ideas clave
        </Heading>
        <div className={styles.cardBody}>
          <ul className={styles.bullets}>
            {block.ideas.map((idea, i) => (
              <li key={`${i}-${block.ideas.length}`}>
                <T value={idea} path={["key_ideas", i]} label={`Idea clave ${i + 1}`} multiline />
                {edit ? (
                  <IconButton label={`Quitar idea ${i + 1}`} onClick={() => edit.remove(["key_ideas", i])}>
                    <X size={16} aria-hidden="true" />
                  </IconButton>
                ) : null}
              </li>
            ))}
          </ul>
          {edit ? <AddButton label="Idea" onClick={() => edit.insert(["key_ideas"], "Nueva idea clave")} /> : null}
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
        <T value={block.text} path={["summary"]} label="Resumen" multiline />
      </p>
      <svg className={styles.squiggle} viewBox="0 0 200 14" aria-hidden="true">
        <path d="M4 9 C 40 3, 70 13, 110 7 S 170 4, 196 8" />
      </svg>
    </section>
  );
}

/**
 * Esquema visual. `illustrations` lleva las URL de las ilustraciones por
 * `illustration_prompt` de la sección; sin ellas se dibujan las locales. Con `edit`, cada texto
 * se edita en su sitio y cada tarjeta lleva su barra de edición.
 */
export function EsquemaView({
  scheme,
  illustrations = {},
  footer,
  edit = null,
}: {
  scheme: Scheme;
  illustrations?: Record<string, string>;
  footer?: ReactNode;
  edit?: SchemeEditApi | null;
}) {
  const layout = useMemo(() => {
    // Al editar, un resumen o unas ideas vacías siguen a la vista para poder escribirlas.
    const shown = edit ? { ...scheme, summary: scheme.summary || " ", key_ideas: scheme.key_ideas.length ? scheme.key_ideas : [" "] } : scheme;
    return layoutScheme(shown, 3);
  }, [scheme, edit]);
  return (
    <EditContext.Provider value={edit}>
      <article className={`${styles.esquema} ${display.variable} ${hand.variable}`} lang="es" data-editing={edit ? "true" : undefined}>
        <header className={styles.head}>
          {scheme.subject ? <p className={styles.srOnly}>{scheme.subject}</p> : null}
          <h2 className={styles.title}>
            <T value={scheme.title} path={["title"]} label="Título del esquema" />
          </h2>
          {scheme.subtitle || edit ? (
            <p className={styles.subtitle}>
              <T value={scheme.subtitle} path={["subtitle"]} label="Subtítulo" />
            </p>
          ) : null}
        </header>

        <div className={styles.grid}>
          {layout.columns.map((column, c) => (
            <div key={c} className={styles.column}>
              {column.map((index) => (
                <div key={index} className={styles.slot} style={{ order: index }}>
                  <Block block={layout.blocks[index]} illustrations={illustrations} />
                </div>
              ))}
            </div>
          ))}
        </div>

        {edit ? (
          <div className={styles.addCard}>
            <AddButton
              label="Tarjeta"
              onClick={() =>
                edit.insert(["sections"], {
                  heading: "Nueva tarjeta",
                  period: "",
                  kind: "list",
                  intro: "",
                  bullets: [{ text: "Escribe aquí", quote: "" }],
                  subcards: [],
                  dates: [],
                  formula: "",
                  highlight: "",
                  illustration_prompt: null,
                  illustration_caption: "",
                })
              }
            />
          </div>
        ) : null}

        <footer className={styles.foot}>
          <span>Contenido generado por IA, revísalo.</span>
          {footer}
        </footer>
      </article>
    </EditContext.Provider>
  );
}
