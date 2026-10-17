"use client";
import { useEffect, useSyncExternalStore } from "react";

// react-markdown, remark/rehype and KaTeX load on demand, outside the initial
// JS. Not React.lazy: a lazy component suspends on its first render even when
// its chunk is already loaded, so a warmed chunk (preloadMarkdown) would still
// flash the plain-text fallback, and an answer that mounts already complete
// would start its soft reveal with no words in it.
type Renderer = typeof import("./markdown-renderer").default;
let renderer: Renderer | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Load the Markdown chunk now; every Markdown on screen switches to it. */
export function preloadMarkdown() {
  loading ??= import("./markdown-renderer").then(
    (m) => {
      renderer = m.default;
      listeners.forEach((listener) => listener());
    },
    () => {
      loading = null; // try again on the next render (offline, deploy)
    },
  );
  return loading;
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export function Markdown({
  content,
  streaming = false,
  reveal = false,
}: {
  content: string;
  /** Re-parse only the block being written (see splitBlocks). */
  streaming?: boolean;
  /** Words wrapped for the soft reveal; the raw fallback stays hidden. */
  reveal?: boolean;
}) {
  const MarkdownRenderer = useSyncExternalStore(
    subscribe,
    () => renderer,
    () => null,
  );
  useEffect(() => {
    if (!MarkdownRenderer) void preloadMarkdown();
  }, [MarkdownRenderer]);
  if (!MarkdownRenderer)
    return (
      <div className={`markdown${reveal ? " markdown-pending" : ""}`}>
        <p>{content}</p>
      </div>
    );
  return (
    <MarkdownRenderer content={content} streaming={streaming} reveal={reveal} />
  );
}
