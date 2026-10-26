"use client";
import { MathBlock } from "./math-block";
import { normalizeMath, plainCopyText } from "@/lib/math";
import { memo, useState, type ReactNode } from "react";
import { rehypeLearningSteps, rehypeRevealWords } from "@/lib/reveal-words";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Copy, Check } from "lucide-react";
// KaTeX styles are global (app/layout.tsx), not part of this chunk.
import katex from "katex";

// Warm KaTeX (its first render builds internal tables) and its fonts while the
// browser is idle, so the first formula of a streamed answer is not a long frame.
if (typeof window !== "undefined") {
  const warm = () => {
    try {
      katex.renderToString("x^2", { throwOnError: false });
      void document.fonts?.load("1em KaTeX_Main");
      void document.fonts?.load("italic 1em KaTeX_Math");
    } catch {}
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(warm);
  else setTimeout(warm, 200);
}
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
// Hoisted: inline objects here would give every element a new component type
// on each render, remounting the whole answer (and its formulas) per delta.
const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins: NonNullable<
  Parameters<typeof ReactMarkdown>[0]["rehypePlugins"]
> = [
  [rehypeKatex, { strict: false, throwOnError: false, trust: false }],
  rehypeLearningSteps,
];
// Answers born in this session: every word in a <span data-w> for the reveal.
const revealPlugins: typeof rehypePlugins = [
  ...rehypePlugins,
  rehypeRevealWords,
];
const components: Components = {
  // `node` (the hast element) is not a DOM attribute: keep it off the spans
  // (with the reveal there is one span per word).
  span: ({ className, children, ...rest }) => {
    const props: Omit<typeof rest, "node"> & { node?: unknown } = { ...rest };
    delete props.node;
    return className?.includes("katex-display") ? (
      <MathBlock>
        <span className={className} {...props}>
          {children}
        </span>
      </MathBlock>
    ) : (
      <span className={className} {...props}>
        {children}
      </span>
    );
  },
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
};

const Block = memo(function Block({
  content,
  reveal,
}: {
  content: string;
  reveal: boolean;
}) {
  return (
    <ReactMarkdown
      skipHtml
      remarkPlugins={remarkPlugins}
      rehypePlugins={reveal ? revealPlugins : rehypePlugins}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
});

/**
 * Split at blank lines outside code fences and $$ blocks. While an answer
 * streams, finished blocks keep the same string, so their memoized render is
 * reused and only the block being written is parsed again.
 */
export function splitBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let fence = false;
  let math = false;
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (/^(```|~~~)/.test(trimmed)) fence = !fence;
    else if (!fence && trimmed === "$$") math = !math;
    if (!trimmed && !fence && !math) {
      if (current.length) blocks.push(current.join("\n"));
      current = [];
    } else current.push(line);
  }
  if (current.length) blocks.push(current.join("\n"));
  return blocks;
}

// Copying an answer gives each formula once and readable (246/100), not the
// MathML and HTML copies KaTeX keeps in the page.
function copyFormulas(e: React.ClipboardEvent<HTMLDivElement>) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return;
  const text = plainCopyText(selection.getRangeAt(0).cloneContents());
  if (text === null) return;
  e.preventDefault();
  e.clipboardData.setData("text/plain", text);
}

export default function MarkdownRenderer({
  content,
  streaming = false,
  reveal = false,
}: {
  content: string;
  streaming?: boolean;
  /** Wrap words for the reveal (components/message.tsx). Fixed for life. */
  reveal?: boolean;
}) {
  const normalized = normalizeMath(content);
  return (
    <div className="markdown" onCopy={copyFormulas}>
      {streaming ? (
        splitBlocks(normalized).map((block, i) => (
          <Block key={i} content={block} reveal={reveal} />
        ))
      ) : (
        <Block content={normalized} reveal={reveal} />
      )}
    </div>
  );
}
