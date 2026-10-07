/** Normalize only explicitly delimited LaTeX, preserving fenced and inline code. */
export function normalizeMath(content: string) {
  return content
    .split(/(```[\s\S]*?```|`[^`]*`)/g)
    .map((part, index) =>
      index % 2
        ? part
        : part
            .replace(
              /\\\[([\s\S]*?)\\\]/g,
              (_match, math: string) => `\n$$\n${math}\n$$\n`,
            )
            .replace(
              /\\\(([\s\S]*?)\\\)/g,
              (_match, math: string) => `$${math}$`,
            ),
    )
    .join("");
}
