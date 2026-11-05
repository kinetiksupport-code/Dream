// Descargas del esquema (docs/ESQUEMAS.md, Bloque 4). Todo se hace en el
// navegador: el contenido no se envía a nadie. HTML autónomo (estilos y fuentes
// dentro), SVG y PNG (el mismo HTML dentro de un SVG, dibujado a 2x), Markdown
// y PDF (diálogo de imprimir, A4 vertical o apaisado).
import type { Scheme } from "./esquema";

const bold = (t: string) => t.replace(/\*\*([^*]+)\*\*/g, "**$1**");

/** El contenido del esquema en Markdown (para copiar en otros apuntes). */
export function toMarkdown(s: Scheme) {
  const out: string[] = [`# ${s.title}`];
  if (s.subtitle) out.push(`_${s.subtitle}_`);
  s.sections.forEach((sec, i) => {
    out.push("", `## ${i + 1}. ${sec.heading}${sec.period ? ` (${sec.period})` : ""}`);
    if (sec.intro) out.push(bold(sec.intro));
    if (sec.formula) out.push("", `$$${sec.formula}$$`);
    sec.dates.forEach((d) => out.push(`- **${d.year}**: ${bold(d.text)}`));
    sec.bullets.forEach((b) => out.push(`- ${bold(b.text)}`));
    sec.subcards.forEach((c) => {
      out.push("", `### ${c.title}${c.period ? ` (${c.period})` : ""}`);
      c.bullets.forEach((b) => out.push(`- ${bold(b.text)}`));
    });
    if (sec.highlight) out.push("", `> ${bold(sec.highlight)}`);
  });
  if (s.key_ideas.length) out.push("", "## Ideas clave", ...s.key_ideas.map((k) => `- ${bold(k)}`));
  if (s.summary) out.push("", "## En resumen", bold(s.summary));
  if (s.closing) out.push("", `→ ${bold(s.closing)}`);
  out.push("", "_Contenido generado por IA con Dream. Revísalo._");
  return out.join("\n") + "\n";
}

/** Nombre de archivo sin tildes ni símbolos: «Al-Ándalus tras…» → «esquema-al-andalus-tras». */
export function fileNameFor(title: string, ext: string, prefix = "esquema") {
  const slug = title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${prefix}-${slug || "dream"}.${ext}`;
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function toDataUrl(url: string) {
  const blob = await (await fetch(url)).blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Todo el CSS de la página (del mismo origen) con las fuentes incrustadas en
 * base64, para que el archivo se vea igual sin internet.
 */
async function inlineCss() {
  let css = "";
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      css += Array.from(sheet.cssRules, (r) => r.cssText).join("\n") + "\n";
    } catch {
      /* hojas de otro origen: no hacen falta */
    }
  }
  // Solo las fuentes que usa el esquema (Baloo 2, Caveat, Inter y KaTeX).
  const fonts = new Map<string, string>();
  for (const m of css.matchAll(/url\((["']?)([^"')]+\.woff2?)\1\)/g)) fonts.set(m[2], "");
  await Promise.all(
    [...fonts.keys()].map(async (u) => {
      try {
        fonts.set(u, await toDataUrl(new URL(u, location.href).href));
      } catch {
        fonts.delete(u);
      }
    }),
  );
  return css.replace(/url\((["']?)([^"')]+\.woff2?)\1\)/g, (all, _q, u) => (fonts.get(u) ? `url("${fonts.get(u)}")` : all));
}

/** Copia del esquema con las imágenes en base64 y sin controles de edición. */
async function snapshot(article: HTMLElement) {
  const copy = article.cloneNode(true) as HTMLElement;
  copy.removeAttribute("data-editing");
  copy.querySelectorAll("[contenteditable]").forEach((el) => el.removeAttribute("contenteditable"));
  copy.querySelectorAll("button, [role='group']").forEach((el) => el.remove());
  await Promise.all(
    Array.from(copy.querySelectorAll("img")).map(async (img) => {
      try {
        img.src = await toDataUrl(img.src);
      } catch {
        img.remove();
      }
    }),
  );
  return copy;
}

function rootVars() {
  const html = document.documentElement;
  return { theme: html.getAttribute("data-theme") ?? "", cls: html.className, bodyCls: document.body.className };
}

/** Página HTML de un solo archivo: se abre sin internet. */
export async function exportHtml(article: HTMLElement, title: string) {
  const [css, copy] = await Promise.all([inlineCss(), snapshot(article)]);
  const { theme, cls, bodyCls } = rootVars();
  const html = `<!doctype html><html lang="es" class="${cls}"${theme ? ` data-theme="${theme}"` : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title.replace(/</g, "&lt;")}</title><style>${css}</style><style>body{margin:0;padding:16px;background:var(--esq-paper,#fff)}</style></head><body class="${bodyCls}">${copy.outerHTML}</body></html>`;
  download(new Blob([html], { type: "text/html" }), fileNameFor(title, "html"));
}

async function svgOf(article: HTMLElement) {
  const box = article.getBoundingClientRect();
  const width = Math.ceil(box.width);
  const height = Math.ceil(box.height);
  const [css, copy] = await Promise.all([inlineCss(), snapshot(article)]);
  const { theme, cls } = rootVars();
  copy.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  copy.style.width = `${width}px`;
  copy.style.margin = "0";
  const xhtml = new XMLSerializer().serializeToString(copy);
  const wrapper = `<div xmlns="http://www.w3.org/1999/xhtml" class="${cls}"${theme ? ` data-theme="${theme}"` : ""}><style><![CDATA[${css.replace(/]]>/g, "")}]]></style>${xhtml}</div>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="100%" height="100%">${wrapper}</foreignObject></svg>`;
  return { svg, width, height };
}

export async function exportSvg(article: HTMLElement, title: string) {
  const { svg } = await svgOf(article);
  download(new Blob([svg], { type: "image/svg+xml" }), fileNameFor(title, "svg"));
}

/** PNG a doble resolución. */
export async function exportPng(article: HTMLElement, title: string, prefix = "esquema") {
  const { svg, width, height } = await svgOf(article);
  const img = new Image();
  img.decoding = "sync";
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear la imagen.");
  ctx.scale(2, 2);
  // Fondo del papel del esquema (si no, lo transparente se ve negro en algunos visores).
  ctx.fillStyle = getComputedStyle(article).backgroundColor || "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("No se pudo crear la imagen.");
  download(blob, fileNameFor(title, "png", prefix));
}

/** PDF: diálogo de imprimir con A4 vertical o apaisado (el texto se puede seleccionar). */
export function printPdf(orientation: "portrait" | "landscape") {
  const style = document.createElement("style");
  style.textContent = `@page { size: A4 ${orientation}; margin: 10mm; }`;
  document.head.append(style);
  const done = () => {
    style.remove();
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
  window.setTimeout(done, 60_000);
}
