"use client";
import { useCallback, useEffect, useState } from "react";
import { callDream } from "./dream-api";
import { FALLBACK_USAGE, parseUsage, type AiUsage } from "./ai-modes";

/** Uso de la ventana de 5 h por modo (acción de solo lectura «ai_usage»). */
export function useAiUsage() {
  const [usage, setUsage] = useState<AiUsage>(FALLBACK_USAGE);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await callDream<unknown>("ai_usage", {}, signal);
      setUsage(parseUsage(data));
      setError(false);
    } catch {
      if (!signal?.aborted) setError(true);
    } finally {
      if (!signal?.aborted) setLoaded(true);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);
  return { usage, loaded, error, refresh };
}
