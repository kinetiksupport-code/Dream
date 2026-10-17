"use client";
// Style lab: every token and primitive of the new style in one place, for
// screenshots and for the next PRs (docs/diseno/estilo/README.md). Not linked
// from the app; app/estilo/page.tsx answers 404 unless DREAM_STYLE_LAB=1.
import { useState } from "react";
import { AnimatedNumber } from "./animated-number";
import { BottomSheet } from "./bottom-sheet";
import { Orb, type OrbReaction } from "./orb";
import { Sticker, type StickerTone } from "./sticker";
import styles from "./style-lab.module.css";

const TONES: { tone: StickerTone; name: string; ratio: string }[] = [
  { tone: "blue", name: "Azul eléctrico", ratio: "7,55:1" },
  { tone: "yellow", name: "Amarillo", ratio: "12,15:1" },
  { tone: "orange", name: "Naranja", ratio: "5,79:1" },
  { tone: "red", name: "Rojo", ratio: "5,06:1" },
  { tone: "purple", name: "Morado", ratio: "6,30:1" },
  { tone: "green", name: "Verde", ratio: "5,00:1" },
  { tone: "lime", name: "Lima", ratio: "15,62:1" },
];

export function StyleLab() {
  const [grade, setGrade] = useState(8);
  const [days, setDays] = useState(12);
  const [reaction, setReaction] = useState<{ kind: OrbReaction; n: number }>();
  const [sheet, setSheet] = useState(false);
  const [round, setRound] = useState(0);
  const react = (kind: OrbReaction) =>
    setReaction((r) => ({ kind, n: (r?.n ?? 0) + 1 }));
  return (
    <main className={styles.lab}>
      <div className={styles.inner}>
        <section className={`${styles.hero} pop tone-blue pop-grid`}>
          <div className={`${styles.heroText} stagger`}>
            <p className="eyebrow" style={{ color: "inherit" }}>
              Estilo nuevo · PR 1
            </p>
            <h1 className="hero-title">
              Entiende lo que <span className="marker marker-draw">estudias</span>
            </h1>
            <p className={styles.lead}>
              Fondos saturados, titulares enormes, pegatinas y botones con
              relieve. El texto largo sigue sobre superficies tranquilas.
            </p>
            <div className={styles.row}>
              <button className="button-3d tone-yellow" type="button">
                <span className="button-3d-face">Empezar</span>
              </button>
            </div>
          </div>
          <div className={styles.heroArt}>
            <Orb size={160} breathing />
            <Sticker
              className={styles.heroSticker}
              tone="yellow"
              size={104}
              tilt={-8}
              animate
            >
              Tus apuntes
            </Sticker>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="tonos">
          <h2 id="tonos">Tonos</h2>
          <div className={styles.swatches}>
            {TONES.map((t) => (
              <div key={t.tone} className={`${styles.swatch} pop tone-${t.tone}`}>
                <strong>{t.name}</strong>
                <span>
                  --pop-{t.tone} · {t.ratio}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="pegatinas">
          <h2 id="pegatinas">Pegatinas</h2>
          <div className={styles.row} key={round}>
            <Sticker tone="yellow" animate>
              Tus apuntes
            </Sticker>
            <Sticker tone="red" tilt={6} animate>
              Sin prisa
            </Sticker>
            <Sticker tone="purple" shape="round" size={96} animate>
              8 sobre 10
            </Sticker>
            <Sticker tone="green" shape="pill" animate>
              Listo
            </Sticker>
            <Sticker tone="orange" shape="pill" animate>
              Preparando
            </Sticker>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="botones">
          <h2 id="botones">Botones con relieve</h2>
          <div className={styles.row}>
            <button className="button-3d tone-red" type="button">
              <span className="button-3d-face">Matemáticas</span>
            </button>
            <button className="button-3d tone-green" type="button">
              <span className="button-3d-face">Biología</span>
            </button>
            <button className="button-3d tone-orange" type="button">
              <span className="button-3d-face">Química</span>
            </button>
            <button className="button-3d" type="button">
              <span className="button-3d-face">Crear examen</span>
            </button>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="numeros">
          <h2 id="numeros">Números que cambian</h2>
          <div className={styles.row}>
            <div className={styles.card}>
              <span className="eyebrow">Nota objetivo</span>
              <AnimatedNumber
                className={styles.big}
                value={grade}
                decimals={grade % 1 ? 1 : 0}
                label={`${grade.toString().replace(".", ",")} sobre 10`}
              />
              <div className="button-row">
                <button
                  className="secondary press"
                  type="button"
                  onClick={() => setGrade((g) => Math.max(0, g - 0.5))}
                >
                  Bajar
                </button>
                <button
                  className="primary press"
                  type="button"
                  onClick={() => setGrade((g) => Math.min(10, g + 0.5))}
                >
                  Subir
                </button>
              </div>
            </div>
            <div className={styles.card}>
              <span className="eyebrow">Cuenta atrás</span>
              <p>
                Faltan{" "}
                <strong>
                  <AnimatedNumber
                    value={days}
                    format={(n) => `${n} ${n === 1 ? "día" : "días"}`}
                  />
                </strong>
              </p>
              <button
                className="secondary press"
                type="button"
                onClick={() => setDays((d) => Math.max(1, d - 1))}
              >
                Un día menos
              </button>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="orbe">
          <h2 id="orbe">El orbe</h2>
          <div className={styles.row}>
            <Orb size={72} breathing />
            <Orb size={72} pulsing />
            <Orb
              size={72}
              reaction={reaction?.kind}
              reactionKey={reaction?.n}
            />
            <div className="button-row">
              <button
                className="secondary press"
                type="button"
                onClick={() => react("success")}
              >
                Acierto
              </button>
              <button
                className="secondary press"
                type="button"
                onClick={() => react("error")}
              >
                Fallo
              </button>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="lista">
          <h2 id="lista">Lista escalonada y hoja inferior</h2>
          <ul className={`${styles.list} stagger`} key={`l${round}`}>
            {["Sube tus apuntes", "Elige la fecha", "Pon tu nota", "Revisa", "Empieza"].map(
              (s) => (
                <li key={s}>{s}</li>
              ),
            )}
          </ul>
          <div className="button-row">
            <button
              className="secondary press"
              type="button"
              onClick={() => setRound((r) => r + 1)}
            >
              Repetir entrada
            </button>
            <button
              className="primary press"
              type="button"
              onClick={() => setSheet(true)}
            >
              Abrir hoja
            </button>
          </div>
        </section>
      </div>
      {sheet && (
        <BottomSheet labelledBy="sheet-title" onClose={() => setSheet(false)}>
          <h2 id="sheet-title">¿Salir?</h2>
          <p>Tu examen se guarda como borrador.</p>
          <div className="modal-actions">
            <button
              className="secondary press"
              type="button"
              onClick={() => setSheet(false)}
            >
              Seguir aquí
            </button>
            <button
              className="primary press"
              type="button"
              onClick={() => setSheet(false)}
            >
              Salir
            </button>
          </div>
        </BottomSheet>
      )}
    </main>
  );
}
