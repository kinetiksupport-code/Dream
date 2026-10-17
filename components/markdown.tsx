"use client";
import { lazy, Suspense } from "react";

// react-markdown, remark/rehype and KaTeX load on demand, outside the initial JS.
const MarkdownRenderer = lazy(() => import("./markdown-renderer"));

export function Markdown({
  content,
  streaming = false,
}: {
  content: string;
  /** Re-parse only the block being written (see splitBlocks). */
  streaming?: boolean;
}) {
  return (
    <Suspense
      fallback={
        <div className="markdown">
          <p>{content}</p>
        </div>
      }
    >
      <MarkdownRenderer content={content} streaming={streaming} />
    </Suspense>
  );
}
