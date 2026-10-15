"use client";
import { MathBlock } from "./math-block";
import { normalizeMath } from "@/lib/math";
import { Children, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Copy, Check } from "lucide-react";
// KaTeX styles travel with this lazily loaded chunk, not the initial bundle.
import "katex/dist/katex.min.css";
function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  async function copy(e: React.MouseEvent<HTMLButtonElement>) {
    const code = e.currentTarget.closest(".code-block")?.querySelector("code");
    try {
      const clone = code?.cloneNode(true);
      if (!(clone instanceof HTMLElement)) return;
      clone.querySelector(".code-language")?.remove();
      await navigator.clipboard.writeText(clone.textContent || "");
      setCopied(true);
    } catch {
      setError("No se pudo copiar. Selecciona el código.");
    }
  }
  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>Código</span>
        <button onClick={copy} aria-label="Copiar código">
          {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre>{children}</pre>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
export default function MarkdownRenderer({ content }: { content: string }) {
  const normalized = normalizeMath(content);
  return (
    <div className="markdown">
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [rehypeKatex, { strict: false, throwOnError: false, trust: false }],
        ]}
        components={{
          h3: ({ children }) => (
            <h3
              className={
                Children.toArray(children).some(
                  (child) =>
                    typeof child === "string" && /^\d{1,2}\s*[/.]/.test(child),
                )
                  ? "learning-step"
                  : undefined
              }
            >
              {children}
            </h3>
          ),
          span: ({ className, children, ...props }) =>
            className?.includes("katex-display") ? (
              <MathBlock>
                <span className={className} {...props}>
                  {children}
                </span>
              </MathBlock>
            ) : (
              <span className={className} {...props}>
                {children}
              </span>
            ),
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          code: ({ className, children, ...props }) => (
            <code className={className} {...props}>
              {className?.startsWith("language-") && (
                <span className="code-language">{className.slice(9)}</span>
              )}
              {children}
            </code>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
