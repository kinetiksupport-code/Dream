// design:check — static rules from DISENO_EVIDENCIA.md (emil-design-eng,
// apple-design). Browser checks (focus, running animations, reduced motion,
// overflow) live in tests/browser/design.spec.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { audit, readTokens } from "../scripts/design/contrast.mjs";

const walk = (dir: string, ext: RegExp): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === "node_modules" || name.startsWith(".")
        ? []
        : walk(path, ext);
    return ext.test(name) ? [path] : [];
  });

const globals = readFileSync("app/globals.css", "utf8");
const cssFiles = [
  "app/globals.css",
  ...walk("app", /\.module\.css$/),
  ...walk("components", /\.module\.css$/),
];
const tokens: Record<string, string> = readTokens(globals).light;
const ms = (value: string): number => {
  const v = value.trim();
  const ref = v.match(/^var\(--([\w-]+)\)$/);
  if (ref) return ms(tokens[ref[1]] ?? "0ms");
  const m = v.match(/^([\d.]+)(ms|s)$/);
  return m ? Number(m[1]) * (m[2] === "s" ? 1000 : 1) : 0;
};
// Strip comments; keep declarations with their file for messages.
const declarations = cssFiles.flatMap((file) => {
  const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  return [
    ...css.matchAll(/(transition|animation)(-[\w-]+)?\s*:\s*([^;{}]+);/g),
  ].map((m) => ({
    file,
    prop: m[1] + (m[2] ?? ""),
    value: m[3]
      .replace(/!important/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  }));
});
const ALLOWED = new Set([
  "transform",
  "opacity",
  "background-color",
  "color",
  "border-color",
  "outline-color",
  "fill",
  "stroke",
  "filter",
]);

test("colour tokens meet WCAG AA in light and dark", () => {
  const failures = audit(readTokens(globals)).filter((r) => !r.ok);
  assert.deepEqual(
    failures.map((r) => `${r.theme} ${r.what} ${r.ratio.toFixed(2)}`),
    [],
  );
});

test("transitions animate only transform, opacity or colour, never layout or all", () => {
  const bad = declarations.filter((d) => {
    if (d.prop === "transition-property")
      return d.value.split(",").some((p) => !ALLOWED.has(p.trim()));
    if (d.prop !== "transition") return false;
    if (d.value === "none") return false;
    return d.value
      .split(/,(?![^(]*\))/)
      .some((part) => !ALLOWED.has(part.trim().split(" ")[0]));
  });
  assert.deepEqual(
    bad.map((d) => `${d.file}: ${d.prop}: ${d.value}`),
    [],
  );
});

test("UI motion stays under 400 ms (looping indicators excepted)", () => {
  const bad = declarations.filter((d) => {
    if (d.prop === "transition" || d.prop === "animation") {
      if (d.prop === "animation" && /infinite/.test(d.value)) return false;
      return d.value
        .split(/,(?![^(]*\))/)
        .some((part) =>
          (part.match(/var\(--[\w-]+\)|[\d.]+m?s\b/g) ?? [])
            .slice(0, 1)
            .some((t) => ms(t) > 400),
        );
    }
    if (d.prop === "transition-duration" || d.prop === "animation-duration")
      return d.value.split(",").some((t) => ms(t) > 400);
    return false;
  });
  assert.deepEqual(
    bad.map((d) => `${d.file}: ${d.prop}: ${d.value}`),
    [],
  );
});

test("no ease-in for entering UI and nothing appears from scale(0)", () => {
  const all = cssFiles.map((f) => [f, readFileSync(f, "utf8")] as const);
  const easeIn = all
    .filter(([, css]) => /(^|[\s,:])ease-in(?!-out)\b/m.test(css))
    .map(([f]) => f);
  const scaleZero = all
    .filter(([, css]) => /scale\(\s*0(\.0+)?\s*[,)]/.test(css))
    .map(([f]) => f);
  assert.deepEqual({ easeIn, scaleZero }, { easeIn: [], scaleZero: [] });
});

test("hover styles only apply to devices that can hover", () => {
  const bad: string[] = [];
  for (const file of cssFiles) {
    const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    // Walk the CSS keeping track of the enclosing @media query.
    const stack: string[] = [];
    let buffer = "";
    for (const ch of css) {
      if (ch === "{") {
        const head = buffer.trim();
        stack.push(head);
        if (
          !head.startsWith("@") &&
          /:hover/.test(head) &&
          !stack.some((s) => /hover:\s*hover/.test(s))
        )
          bad.push(`${file}: ${head.slice(0, 80)}`);
        buffer = "";
      } else if (ch === "}") {
        stack.pop();
        buffer = "";
      } else if (ch === ";") buffer = "";
      else buffer += ch;
    }
  }
  assert.deepEqual(bad, []);
});

test("fonts load on <html> so the font stack resolves (Inter, latin-ext)", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /<html[\s\S]*?className=\{`\$\{inter\.variable\}/);
  assert.match(layout, /latin-ext/);
  assert.doesNotMatch(layout, /<body className=\{inter/);
  assert.match(globals, /--font-stack:[^;]*var\(--font-inter\)/);
});

test("Spanish interface text keeps its accents", () => {
  const MISSING =
    /\b(Explicamelo|Explicame|examenes|leccion|sesion|informacion|configuracion|conversacion|busqueda|ultimo|ultima|facil|dificil|pagina|numero|titulo|rapido|tambien|aqui|todavia|despues|segun|ademas)\b/i;
  const bad: string[] = [];
  for (const file of [
    ...walk("app", /\.tsx$/),
    ...walk("components", /\.tsx$/),
    ...walk("lib", /\.ts$/),
  ]) {
    const src = readFileSync(file, "utf8");
    // Only text a person reads: string literals and JSX text.
    for (const m of src.matchAll(
      /"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`|>([^<>{}]+)</g,
    )) {
      const text = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
      if (/^[\w./@:-]*$/.test(text)) continue; // identifiers, paths, classes
      const hit = text.match(MISSING);
      if (hit) bad.push(`${file}: «${hit[0]}» en "${text.slice(0, 60)}"`);
    }
  }
  assert.deepEqual(bad, []);
});

// --- New style (PROMPT_EXAMEN_ESTILO.md §6): automatic motion checks -------

/** Every @keyframes block with the properties it animates. */
const keyframes = cssFiles.flatMap((file) => {
  const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const out: { file: string; name: string; props: string[] }[] = [];
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    let i = re.lastIndex;
    for (let depth = 1; depth && i < css.length; i++)
      depth += css[i] === "{" ? 1 : css[i] === "}" ? -1 : 0;
    const body = css.slice(re.lastIndex, i - 1);
    const props = [
      ...new Set([...body.matchAll(/([\w-]+)\s*:/g)].map((p) => p[1])),
    ];
    out.push({ file, name: m[1], props });
  }
  return out;
});

test("@keyframes animate only transform and opacity (no layout, no colour loops)", () => {
  assert.ok(keyframes.length > 10, "keyframes were found");
  const bad = keyframes.flatMap((k) =>
    k.props
      .filter(
        (p) =>
          !["transform", "opacity", "animation-timing-function"].includes(p),
      )
      .map((p) => `${k.file}: @keyframes ${k.name} anima ${p}`),
  );
  assert.deepEqual(bad, []);
});

test("every animation-name used exists as @keyframes", () => {
  const names = new Set(keyframes.map((k) => k.name));
  const KEYWORDS =
    /^(none|infinite|both|forwards|backwards|alternate|reverse|normal|linear|ease|ease-out|ease-in-out|step-start|step-end|paused|running|var|calc|cubic-bezier|linear\(.*|steps)$/;
  const bad: string[] = [];
  for (const d of declarations) {
    if (d.prop !== "animation" && d.prop !== "animation-name") continue;
    if (/\(/.test(d.value) && d.prop === "animation-name") continue;
    for (const part of d.value.split(/,(?![^(]*\))/)) {
      const tokens = part
        .replace(/[a-z-]+\([^)]*\)/g, " ")
        .trim()
        .split(/\s+/)
        .filter((t) => t && !/^[\d.]+m?s$/.test(t) && !KEYWORDS.test(t));
      if (tokens[0] && !names.has(tokens[0]))
        bad.push(`${d.file}: ${d.prop}: ${d.value}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("scripts never animate layout or `all` (inline styles and WAAPI)", () => {
  const LAYOUT =
    /\b(width|height|top|left|right|bottom|margin\w*|padding\w*|inset)\b/;
  const bad: string[] = [];
  for (const file of [
    ...walk("app", /\.tsx?$/),
    ...walk("components", /\.tsx?$/),
    ...walk("lib", /\.tsx?$/),
  ]) {
    const src = readFileSync(file, "utf8");
    // transition: "all …" / transitionProperty: "width" in style objects.
    for (const m of src.matchAll(
      /transition(?:Property)?\s*:\s*["'`]([^"'`]*)["'`]/g,
    ))
      if (/\ball\b/.test(m[1]) || LAYOUT.test(m[1]))
        bad.push(`${file}: transition "${m[1]}"`);
    // element.animate([{ width: … }]) — keyframes right after .animate(
    for (const m of src.matchAll(/\.animate\(\s*\[([\s\S]{0,400}?)\]/g))
      for (const key of m[1].matchAll(/([A-Za-z]+)\s*:/g))
        if (LAYOUT.test(key[1])) bad.push(`${file}: animate() con ${key[1]}`);
  }
  assert.deepEqual(bad, []);
});

test("dark tokens match in [data-theme=dark] and prefers-color-scheme", () => {
  const block = (re: RegExp) => {
    const m = globals.match(re);
    assert.ok(m, `bloque ${re} encontrado`);
    return Object.fromEntries(
      [...m[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map((x) => [
        x[1],
        x[2].replace(/\s+/g, " ").trim(),
      ]),
    );
  };
  const forced = block(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/);
  const system = block(
    /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme\]\)\s*\{([\s\S]*?)\n {2}\}/,
  );
  assert.deepEqual(system, forced);
});

test("the new style's tokens exist in light and dark", () => {
  const { light, dark } = readTokens(globals);
  const tones = ["blue", "yellow", "orange", "red", "purple", "green", "lime"];
  for (const t of tones)
    for (const theme of [light, dark]) {
      assert.ok(theme[`pop-${t}`], `--pop-${t}`);
      assert.ok(theme[`on-pop-${t}`], `--on-pop-${t}`);
    }
  for (const k of [
    "marker",
    "sticker-ring",
    "shadow-sticker",
    "gloss",
    "grid-line",
    "text-hero",
    "weight-hero",
    "radius-hero",
    "radius-pill",
    "ease-spring",
    "dur-number",
    "dur-spring",
    "dur-breathe",
  ])
    assert.ok(light[k], `--${k}`);
});

test("page transitions: 200–280 ms in, faster out, reduced motion ≤ 150 ms", () => {
  assert.ok(ms("var(--dur-page)") >= 200 && ms("var(--dur-page)") <= 280);
  assert.ok(ms("var(--dur-page-out)") < ms("var(--dur-page)"));
  assert.ok(ms("var(--dur-page-reduced)") <= 150);
  // Only the page area takes part; the theme cross-fade keeps its own rules.
  assert.match(
    globals,
    /:root\[data-page-transition\] \.route-view \{\s*view-transition-name: page;/,
  );
  assert.match(globals, /::view-transition-old\(theme-control\)/);
});
