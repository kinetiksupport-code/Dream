"use client";
import { useEffect, useSyncExternalStore } from "react";
// KaTeX styles go with the page that shows Markdown, not with the lazy chunk:
// a stylesheet that arrives with a chunk is inserted by Next as a blocking
// <link precedence>, and React holds every update until it loads, keystrokes
// in the composer included (the chunk is warmed right after the chat opens,
// so a student typing at once lost the Enter). Only @font-face rules and
// classes: the fonts themselves still download on the first formula.
import "katex/dist/katex.min.css";

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
