"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GAME_SANDBOX, gameDocument, parseGameMessage, type Game } from "@/lib/dream-games";

/**
 * El juego en un iframe aislado (docs/ESQUEMAS.md, Bloque 7): sandbox solo con
 * allow-scripts (origen opaco: sin cookies, almacenamiento ni acceso a Dream),
 * CSP sin red dentro del documento y mensajes con formato fijo, aceptados solo
 * si vienen de este iframe.
 */
export function GameFrame({ game, title, onResult }: { game: Game; title: string; onResult: (aciertos: number, total: number) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(480);
  const doc = useMemo(() => gameDocument(game), [game]);
  const report = useRef(onResult);
  report.current = onResult;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow || event.origin !== "null") return;
      const message = parseGameMessage(event.data);
      if (!message) return;
      if (message.tipo === "altura") setHeight(message.alto);
      else report.current(message.aciertos, message.total);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <iframe
      ref={frame}
      title={title}
      sandbox={GAME_SANDBOX}
      srcDoc={doc}
      referrerPolicy="no-referrer"
      allow=""
      loading="eager"
      data-testid="game-frame"
      style={{ width: "100%", height, border: 0, borderRadius: 16, display: "block", background: "transparent" }}
    />
  );
}
