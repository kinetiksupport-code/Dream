"use client";
// Tutorial al entrar (prompt «sintagmas», petición de Carlos): una animación
// corta en bucle con «El perro de mi vecino ladra», tres pasos numerados, un
// cuarto sobre anidar y un ejemplo ya resuelto. «Entendido» cierra; la
// casilla de abajo lo oculta para siempre (se puede volver a ver con «?» o
// desde Ajustes). Foco atrapado y Esc: Modal. Movimiento reducido: sin
// animación, la demo se ve ya hecha.
import { useId, useState } from "react";
import { Modal } from "../modal";
import s from "./sintagmas.module.css";

const DEMO = ["El", "perro", "de", "mi", "vecino", "ladra"];
type Row = { start: number; end: number; label: string };
/** El ejemplo resuelto: fila a fila, de fuera adentro. */
const SOLVED: Row[][] = [
  [{ start: 0, end: 5, label: "SN" }, { start: 5, end: 6, label: "SV" }],
  [{ start: 0, end: 1, label: "Det" }, { start: 1, end: 2, label: "N" }, { start: 2, end: 5, label: "SPrep" }, { start: 5, end: 6, label: "N" }],
  [{ start: 2, end: 3, label: "E" }, { start: 3, end: 5, label: "SN" }],
  [{ start: 3, end: 4, label: "Det" }, { start: 4, end: 5, label: "N" }],
];

export function Tutorial({
  hidden,
  onClose,
}: {
  /** Valor actual de «No volverme a mostrar este tutorial». */
  hidden: boolean;
  onClose: (hideNextTime: boolean) => void;
}) {
  const title = useId();
  const intro = useId();
  const [hide, setHide] = useState(hidden);
  return (
    <Modal labelledBy={title} describedBy={intro} onClose={() => onClose(hide)} className={s.tutorial}>
      <h2
        id={title}
        tabIndex={-1}
        // Modal enfoca lo primero con [autofocus]: el título, para empezar a leer arriba.
        ref={(el) => el?.setAttribute("autofocus", "")}
      >Cómo se marcan los sintagmas</h2>
      <p id={intro} className={s.tutorialIntro}>
        Vas a dibujar rayas debajo de las palabras y a decir qué es cada una. Mira el ejemplo:
      </p>
      <div className={s.demoStage} aria-hidden="true">
        <div className={s.demo} style={{ gridTemplateColumns: `repeat(${DEMO.length}, auto)` }}>
          {DEMO.map((w, i) => (
            <span key={w} className={s.demoWord} style={{ gridColumn: i + 1 }} data-in={i < 5 ? "" : undefined}>
              {w}
            </span>
          ))}
          <span className={s.demoBracket} style={{ gridColumn: "1 / 6" }}>
            <i />
            <b>SN</b>
          </span>
          <span className={s.demoChips} style={{ gridColumn: "1 / 7" }}>
            {["SN", "SV", "SAdj", "SAdv", "SPrep"].map((l) => (
              <b key={l} data-pick={l === "SN" ? "" : undefined}>
                {l}
              </b>
            ))}
          </span>
          <i className={s.demoCursor} />
        </div>
        <span className={s.demoCheck}>Comprobar</span>
      </div>
      <ol className={s.steps}>
        <li>
          <b>Arrastra sobre las palabras</b> con el ratón para dibujar la raya. Para una sola palabra, haz doble clic.
        </li>
        <li>
          <b>Elige la etiqueta</b> que sale junto a la raya: SN, SV, SAdj, SAdv, SPrep… También el núcleo (N), el
          determinante (Det) y el enlace (E).
        </li>
        <li>
          <b>Pulsa Comprobar</b> cuando lo tengas. Si algo falla, te explico por qué.
        </li>
        <li>
          <b>Un sintagma puede ir dentro de otro:</b> marca primero el grande y luego el pequeño. Las rayas nunca se
          cruzan.
        </li>
      </ol>
      <figure className={s.solved}>
        <figcaption>Así queda resuelto:</figcaption>
        <div className={s.solvedGrid} style={{ gridTemplateColumns: `repeat(${DEMO.length}, auto)` }} role="img"
          aria-label="El perro de mi vecino es un SN con Det «El», núcleo «perro» y un SPrep «de mi vecino» (enlace «de» y SN «mi vecino»). Ladra es el SV.">
          {DEMO.map((w, i) => (
            <span key={w} className={s.solvedWord} style={{ gridColumn: i + 1 }}>
              {w}
            </span>
          ))}
          {SOLVED.flatMap((row, r) =>
            row.map((m) => (
              <span
                key={`${r}-${m.start}-${m.label}`}
                className={s.solvedMark}
                style={{ gridColumn: `${m.start + 1} / ${m.end + 1}`, gridRow: r + 2 }}
              >
                <i />
                {m.label}
              </span>
            )),
          )}
        </div>
      </figure>
      <p className={s.tutorialKeys}>Con teclado: flechas para moverte, Mayús + flechas para abarcar palabras e Intro para dibujar la raya. Ctrl + Z deshace.</p>
      <div className={s.tutorialActions}>
        <button type="button" className="primary press" onClick={() => onClose(hide)}>
          Entendido
        </button>
        <label className={s.dontShow}>
          <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
          No volverme a mostrar este tutorial
        </label>
      </div>
    </Modal>
  );
}
