"use client";
import { lazy, Suspense } from "react";

// react-markdown, remark/rehype and KaTeX load on demand, outside the initial JS.
const MarkdownRenderer = lazy(() => import("./markdown-renderer"));

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
  return (
    <Suspense
      fallback={
        <div className={`markdown${reveal ? " markdown-pending" : ""}`}>
          <p>{content}</p>
        </div>
      }
    >
      <MarkdownRenderer
        content={content}
        streaming={streaming}
        reveal={reveal}
      />
    </Suspense>
  );
}
