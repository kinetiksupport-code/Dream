// Native AbortController works on older Safari versions lacking AbortSignal.any/timeout.
export function requestAbort(parent?: AbortSignal, timeoutMs = 180000) {
  const controller = new AbortController();
  const abort = () => controller.abort(parent?.reason);
  if (parent?.aborted) abort();
  else parent?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException(
          "La solicitud superó su tiempo máximo.",
          "TimeoutError",
        ),
      ),
    timeoutMs,
  );
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abort);
    },
  };
}
