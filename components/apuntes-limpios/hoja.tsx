import { Fragment } from "react";
import { Kalam } from "next/font/google";
import { sectionNumbers, type CleanNotes, type NotesPage } from "@/lib/clean-notes";
import styles from "./hoja.module.css";

// Letra manuscrita legible, autoalojada con next/font (sin peticiones a Google
// en el navegador). Comparada con Caveat y Patrick Hand en el PR: Kalam se lee
// mejor en móvil a 17 px y lleva todas las tildes.
const hand = Kalam({ subsets: ["latin", "latin-ext"], weight: ["300", "400", "700"], variable: "--hoja-hand", display: "swap" });

/**
 * Los apuntes pasados a limpio como hojas de cuaderno (docs/APUNTES-LIMPIOS.md):
 * renglones con CSS, título subrayado, apartados numerados con el subtítulo
 * resaltado «a rotulador», términos en negrita, cajas con flechas, recuadro
 * «Idea clave» y número de página. Solo pinta: el contenido ya viene validado.
 */
export function Hoja({ notes }: { notes: CleanNotes }) {
  const numbers = sectionNumbers(notes.pages);
  return (
    <div className={`${styles.stack} ${hand.variable}`}>
      {notes.pages.map((page, p) => (
        <Sheet key={p} page={page} index={p} title={p === 0 ? notes.title : ""} numbers={numbers[p]} />
      ))}
    </div>
  );
}

function Sheet({ page, index, title, numbers }: { page: NotesPage; index: number; title: string; numbers: number[] }) {
  return (
    <article className={styles.sheet} aria-label={`Página ${index + 1}`}>
      {title ? <h1 className={styles.title}>{title}</h1> : null}
      {page.sections.map((s, i) => (
        <section className={styles.section} key={i}>
          <h2 className={styles.heading}>
            <span className={styles.num}>{numbers[i]}.</span>{" "}
            <mark className={styles.marker}>
              {s.heading}
              {s.period ? <span className={styles.period}> ({s.period})</span> : null}
            </mark>
          </h2>
          <ul className={styles.bullets}>
            {s.bullets.map((b, j) => (
              <li key={j}>
                {b.term ? (
                  <>
                    <strong className={styles.term}>{b.term}:</strong>{" "}
                  </>
                ) : null}
                {b.text}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {page.flow.length >= 3 ? (
        <ol className={styles.flow} aria-label="Esquema del tema">
          {page.flow.map((f, i) => (
            <Fragment key={i}>
              <li className={styles.box}>
                <span>{f.label}</span>
                {f.period ? <span className={styles.boxPeriod}>({f.period})</span> : null}
              </li>
              {i < page.flow.length - 1 ? (
                <li className={styles.arrow} aria-hidden="true">
                  →
                </li>
              ) : null}
            </Fragment>
          ))}
        </ol>
      ) : null}
      {page.key_idea.text ? (
        <p className={styles.key}>
          <mark className={styles.marker}>Idea clave:</mark> {page.key_idea.text}
        </p>
      ) : null}
      <span className={styles.pageNumber} aria-hidden="true">
        {index + 1}
      </span>
    </article>
  );
}
