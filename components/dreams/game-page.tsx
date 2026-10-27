"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { callDream, errorMessage } from "@/lib/dream-api";
import { GAME_LABEL, parseGame, type Game, type GameKind } from "@/lib/dream-games";
import { DreamActivity } from "@/components/dream-mark";
import { GameFrame } from "./game-frame";
import styles from "@/components/esquema/esquema-page.module.css";

type Row = { id: string; kind: GameKind; title: string; content: unknown; best_score: number | null; total: number | null };

/** Pantalla de un Dream interactivo: el juego aislado, el aviso de IA y el resultado. */
export function GamePage({ id }: { id: string }) {
  const [row, setRow] = useState<Row | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    callDream<{ game: Row }>("game_get", { game_id: id }, controller.signal)
      .then((r) => {
        setRow(r.game);
        const parsed = parseGame(r.game.content);
        setGame(parsed);
        if (!parsed) setError("Este juego no se puede abrir. Pídele a Dream otro con los mismos apuntes.");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, retry]);

  const onResult = useCallback(
    (aciertos: number, total: number) => {
      setNotice(aciertos === total ? `¡Todo bien! ${aciertos} de ${total}.` : `${aciertos} de ${total}. Repasa las que fallaste y vuelve a jugar.`);
      callDream<{ result: { best_score: number; total: number } }>("game_result", { game_id: id, aciertos, total })
        .then((r) => setRow((s) => (s ? { ...s, best_score: r.result.best_score, total: r.result.total } : s)))
        .catch(() => {});
    },
    [id],
  );

  if (loading)
    return (
      <div className="boot">
        <DreamActivity state="thinking" label="Abriendo el juego" />
      </div>
    );
  if (!row || !game)
    return (
      <div className="boot">
        <div className="status-page">
          <h1>No pudimos abrir este juego</h1>
          <p className="error" role="alert">
            {error}
          </p>
          <div className="button-row">
            <button className="primary press" onClick={() => setRetry((s) => s + 1)}>
              Reintentar
            </button>
            <Link className="secondary press" href="/dreams">
              Ir a Dreams
            </Link>
          </div>
        </div>
      </div>
    );
  return (
    <main className={styles.page} style={{ maxWidth: 960 }}>
      <div className={styles.bar}>
        <Link className="secondary press" href="/dreams">
          <ArrowLeft size={18} aria-hidden="true" /> Dreams
        </Link>
        {row.best_score != null && row.total ? (
          <span className="muted">
            Tu mejor marca: <span className="num">{row.best_score}</span> de <span className="num">{row.total}</span>
          </span>
        ) : null}
      </div>
      <p className="muted" style={{ margin: "8px 0 2px", fontSize: 14 }}>
        Dreams · {GAME_LABEL[game.kind]}
      </p>
      <h1 className="title" style={{ marginTop: 0 }}>
        {game.title}
      </h1>
      <p className={styles.status} role="status" aria-live="polite">
        {notice}
      </p>
      <GameFrame game={game} title={`Juego: ${game.title}`} onResult={onResult} />
      <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
        Generado por IA a partir de tus apuntes. Revísalo: si algo no cuadra, manda tus apuntes.
      </p>
    </main>
  );
}
