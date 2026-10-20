"use client";
import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "./dream-api";
import type { CollectionSource } from "./study-data";

export type CollectionState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: T[] };

/** Loads a collection with explicit loading / error / ready states. */
export function useCollection<T>(source: CollectionSource<T>) {
  const [state, setState] = useState<CollectionState<T>>({
    status: "loading",
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    source
      .list(controller.signal)
      .then((items) => setState({ status: "ready", items }))
      .catch((e) => {
        if (!controller.signal.aborted)
          setState({ status: "error", message: errorMessage(e) });
      });
    return () => controller.abort();
  }, [source, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
