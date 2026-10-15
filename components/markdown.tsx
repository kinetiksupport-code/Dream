"use client";
import { lazy, Suspense } from "react";

// react-markdown, remark/rehype and KaTeX load on demand, outside the initial JS.
const MarkdownRenderer = lazy(() => import("./markdown-renderer"));

export function Markdown({ content }: { content: string }) {
  return (
    <Suspense
      fallback={
        <div className="markdown">
          <p>{content}</p>
        </div>
      }
    >
      <MarkdownRenderer content={content} />
    </Suspense>
  );
}
