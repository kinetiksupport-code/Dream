// Server component: legal text is rendered at build time, with no client JS.
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  rehypeTableLabels,
  remarkLegalPlaceholders,
} from "@/lib/legal-markdown";
import s from "./legal.module.css";

export function LegalDocument({
  title,
  content,
}: {
  title: string;
  content: string;
}) {
  return (
    <article className={s.article}>
      <h1 className={s.title}>{title}</h1>
      <div className={s.prose}>
        <ReactMarkdown
          skipHtml
          remarkPlugins={[remarkGfm, remarkLegalPlaceholders]}
          rehypePlugins={[rehypeTableLabels]}
          components={{
            table: ({ children }) => (
              <div className={s.tableWrap}>
                <table>{children}</table>
              </div>
            ),
            a: ({ href = "", children }) =>
              href.startsWith("/") ? (
                <Link href={href}>{children}</Link>
              ) : (
                <a
                  href={href}
                  {...(href.startsWith("mailto:")
                    ? {}
                    : { target: "_blank", rel: "noopener noreferrer" })}
                >
                  {children}
                </a>
              ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </article>
  );
}
