// Dreams interactivos (docs/ESQUEMAS.md, Bloque 7). Qwen solo escribe el
// contenido (games.mjs lo valida); la lógica es esta plantilla de Dream, que
// corre en un <iframe sandbox="allow-scripts"> sin allow-same-origin: origen
// opaco, sin cookies ni almacenamiento, sin acceso a Dream y, por la CSP de
// dentro, sin red. Solo habla con Dream por postMessage con formato fijo.

export type GameKind = "classify" | "match";
export interface ClassifyGame {
  kind: "classify";
  title: string;
  instructions: string;
  categories: string[];
  items: { text: string; category: string; explanation: string }[];
}
export interface MatchGame {
  kind: "match";
  title: string;
  instructions: string;
  pairs: { concept: string; definition: string }[];
}
export type Game = ClassifyGame | MatchGame;

export const GAME_LABEL: Record<GameKind, string> = {
  classify: "Clasificar",
  match: "Emparejar",
};

/**
 * El alumno pide un juego para practicar («hazme un juego», «quiero clasificar
 * los sintagmas», «empareja los conceptos»). No cuenta una pregunta sobre qué es.
 */
export function wantsGame(prompt: string) {
  const text = prompt.toLowerCase();
  if (/qu[eé] es (un|el) juego|imprimir/.test(text)) return false;
  if (/\b(juego|jueguito|minijuego|jugar)\b/.test(text))
    return /\b(hazme|haz|hacer|crea|crear|genera|generar|necesito|prep[aá]rame|ponme|quiero (un|jugar)|un juego|minijuego)\b/.test(text);
  return /\b(empareja(r)?|relaciona(r)?|clasifica(r)?)\b.*\b(conceptos?|definiciones|sintagmas?|palabras|t[eé]rminos|apuntes|categor[ií]as)\b/.test(text);
}

/** Clasificar (sintagmas, categorías) o emparejar; igual que gameKindFor en dream-api. */
export function gameKindFor(prompt: string): GameKind {
  return /clasific|sintagma|categor|agrupa|ordena por tipo/i.test(prompt) ? "classify" : "match";
}

const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

/** Comprueba la forma del contenido antes de montar el juego (fallback si no vale). */
export function parseGame(value: unknown): Game | null {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== "object" || !isText(v.title, 120)) return null;
  const instructions = typeof v.instructions === "string" ? v.instructions.slice(0, 200) : "";
  if (v.kind === "classify") {
    const categories = Array.isArray(v.categories) ? v.categories.filter((c) => isText(c, 60)) : [];
    const items = Array.isArray(v.items)
      ? v.items.filter(
          (it) => it && isText(it.text, 160) && categories.includes(it.category) && (it.explanation === undefined || typeof it.explanation === "string"),
        )
      : [];
    if (categories.length < 2 || categories.length > 6 || items.length < 2 || items.length > 20) return null;
    return {
      kind: "classify",
      title: v.title,
      instructions,
      categories,
      items: items.map((it) => ({ text: it.text, category: it.category, explanation: String(it.explanation ?? "").slice(0, 200) })),
    };
  }
  if (v.kind === "match") {
    const pairs = Array.isArray(v.pairs) ? v.pairs.filter((p) => p && isText(p.concept, 80) && isText(p.definition, 200)) : [];
    if (pairs.length < 2 || pairs.length > 10) return null;
    return { kind: "match", title: v.title, instructions, pairs: pairs.map((p) => ({ concept: p.concept, definition: p.definition })) };
  }
  return null;
}

/** Lo único que Dream acepta del juego. */
export type GameMessage = { tipo: "resultado"; aciertos: number; total: number } | { tipo: "altura"; alto: number };

/** Valida un mensaje del iframe: forma exacta, sin campos de más. */
export function parseGameMessage(data: unknown): GameMessage | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const keys = Object.keys(d).sort().join(",");
  if (d.tipo === "resultado" && keys === "aciertos,tipo,total") {
    const { aciertos, total } = d;
    if (Number.isInteger(aciertos) && Number.isInteger(total) && (total as number) > 0 && (total as number) <= 50 && (aciertos as number) >= 0 && (aciertos as number) <= (total as number))
      return { tipo: "resultado", aciertos: aciertos as number, total: total as number };
  }
  if (d.tipo === "altura" && keys === "alto,tipo" && typeof d.alto === "number" && Number.isFinite(d.alto))
    return { tipo: "altura", alto: Math.min(4000, Math.max(160, Math.round(d.alto))) };
  return null;
}

export const GAME_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";
export const GAME_SANDBOX = "allow-scripts";

/** JSON seguro dentro de <script>: nada puede cerrar la etiqueta. */
export function jsonForScript(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const STYLE = `
:root{color-scheme:light dark;--bg:#fbf8f3;--card:#fff;--ink:#1d1b26;--muted:#5d5a6b;--line:#d9d3c7;--accent:#5b4bd6;--accent-ink:#fff;--soft:#efeafd;--ok:#1f7a4d;--ok-soft:#e3f4ea;--bad:#b3261e;--bad-soft:#fde7e5;--focus:#5b4bd6}
@media (prefers-color-scheme:dark){:root{--bg:#16151c;--card:#211f2a;--ink:#f1eef8;--muted:#b7b2c8;--line:#3a3747;--accent:#a99cff;--accent-ink:#16151c;--soft:#2c2840;--ok:#7fd6a5;--ok-soft:#1d3428;--bad:#ff9b92;--bad-soft:#3d2120;--focus:#a99cff}}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{padding:16px;max-width:900px;margin:0 auto}
p{margin:0 0 12px}
.hint{color:var(--muted);font-size:14px}
button{font:inherit;color:inherit;cursor:pointer;border-radius:12px;border:1.5px solid var(--line);background:var(--card);padding:10px 14px;min-height:44px;text-align:left;transition:transform .15s ease,background .15s ease,border-color .15s ease;-webkit-user-select:none;user-select:none}
.chip{touch-action:none}
button:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
button:active{transform:scale(.98)}
button[aria-pressed=true]{border-color:var(--accent);background:var(--soft)}
button:disabled{opacity:.55;cursor:default}
.primary{background:var(--accent);color:var(--accent-ink);border-color:var(--accent);font-weight:600;text-align:center}
.pool,.zone-items{display:flex;flex-wrap:wrap;gap:8px}
.pool{min-height:52px;padding:10px;border:1.5px dashed var(--line);border-radius:14px;margin-bottom:16px}
.zones{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px}
.zone{border:1.5px solid var(--line);border-radius:16px;background:var(--card);padding:10px;min-height:120px;display:flex;flex-direction:column;gap:8px}
.zone.over{border-color:var(--accent);background:var(--soft)}
.zone-head{font-weight:700;width:100%;text-align:center;background:var(--soft);border-color:transparent}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
.col{display:flex;flex-direction:column;gap:8px}
.col h2{font-size:14px;margin:0;color:var(--muted);font-weight:600}
.badge{display:inline-grid;place-items:center;min-width:24px;height:24px;border-radius:999px;background:var(--accent);color:var(--accent-ink);font-size:13px;font-weight:700;margin-right:8px;vertical-align:middle}
.ok{border-color:var(--ok)!important;background:var(--ok-soft)!important}
.bad{border-color:var(--bad)!important;background:var(--bad-soft)!important}
.ok:disabled,.bad:disabled{opacity:1;color:var(--ink)}
.mark{font-weight:700;margin-left:6px}
.why{display:block;font-size:13px;color:var(--muted);margin-top:4px}
.actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.score{font-weight:700;font-size:18px}
.ghost{position:fixed;pointer-events:none;z-index:9;opacity:.9;box-shadow:0 8px 24px rgba(0,0,0,.18)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:520px){.cols{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}button:active{transform:none}}
`;

// Lógica común y de cada plantilla. Todo el texto del contenido entra con
// textContent: nunca como HTML.
export const GAME_SCRIPT = `
(function(){
"use strict";
var game = JSON.parse(document.getElementById("data").textContent);
var root = document.getElementById("app");
var live = document.getElementById("live");
function el(tag, cls, text){ var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
function say(t){ live.textContent = ""; setTimeout(function(){ live.textContent = t; }, 30); }
function send(m){ try { parent.postMessage(m, "*"); } catch (e) {} }
function shuffle(a){ a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function height(){ send({ tipo: "altura", alto: Math.ceil(document.documentElement.scrollHeight) }); }
if (typeof ResizeObserver === "function") new ResizeObserver(height).observe(document.body);
window.addEventListener("load", height);

// Arrastrar con el dedo o el ratón (pointer events: también en móvil). Al
// soltar sobre un destino [data-drop] se llama onDrop; un toque sin mover es un clic.
function draggable(node, onDrop){
  var start = null, ghost = null, over = null;
  node.addEventListener("pointerdown", function(e){ if (node.disabled || e.button > 0) return; start = { x: e.clientX, y: e.clientY }; });
  node.addEventListener("pointermove", function(e){
    if (!start) return;
    if (!ghost) {
      if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) < 8) return;
      try { node.setPointerCapture(e.pointerId); } catch (x) {}
      ghost = node.cloneNode(true); ghost.classList.add("ghost"); ghost.removeAttribute("id");
      ghost.style.width = node.offsetWidth + "px"; document.body.appendChild(ghost);
    }
    ghost.style.left = (e.clientX - node.offsetWidth / 2) + "px"; ghost.style.top = (e.clientY - 22) + "px";
    var under = document.elementFromPoint(e.clientX, e.clientY); var target = under && under.closest("[data-drop]");
    if (over && over !== target) over.classList.remove("over");
    over = target; if (over) over.classList.add("over");
  });
  function end(e){
    if (ghost) { ghost.remove(); ghost = null; if (over) { over.classList.remove("over"); onDrop(over); } node.dataset.dragged = "1"; setTimeout(function(){ delete node.dataset.dragged; }, 0); }
    start = null; over = null;
  }
  node.addEventListener("pointerup", end); node.addEventListener("pointercancel", end);
}
function onTap(node, fn){ node.addEventListener("click", function(){ if (!node.dataset.dragged) fn(); }); }

function finish(aciertos, total, checkBtn, again){
  checkBtn.hidden = true; again.hidden = false;
  var s = document.getElementById("score"); s.textContent = aciertos + " de " + total + " bien";
  say("Has acertado " + aciertos + " de " + total + ".");
  send({ tipo: "resultado", aciertos: aciertos, total: total });
  again.focus();
}

function classify(){
  var state = game.items.map(function(){ return null; });
  var selected = null, checked = false;
  root.appendChild(el("p", null, game.instructions));
  root.appendChild(el("p", "hint", "Toca un elemento y después su categoría, o arrástralo. Con el teclado: Tab, Intro y otra vez Intro."));
  var pool = el("div", "pool"); pool.setAttribute("data-drop", "pool"); pool.setAttribute("aria-label", "Sin colocar"); pool.setAttribute("role", "group");
  root.appendChild(pool);
  var zones = el("div", "zones"); root.appendChild(zones);
  var zoneEls = game.categories.map(function(c, ci){
    var z = el("section", "zone"); z.setAttribute("data-drop", String(ci)); z.setAttribute("aria-label", c);
    var head = el("button", "zone-head", c); head.type = "button"; head.setAttribute("aria-label", "Colocar en " + c);
    onTap(head, function(){ if (selected != null) place(selected, ci); });
    var items = el("div", "zone-items");
    z.appendChild(head); z.appendChild(items); zones.appendChild(z);
    return items;
  });
  var order = shuffle(game.items.map(function(_, i){ return i; }));
  var chips = game.items.map(function(it, i){
    var b = el("button", "chip", it.text); b.type = "button"; b.setAttribute("aria-pressed", "false"); b.id = "it" + i;
    onTap(b, function(){ if (checked) return; select(selected === i ? null : i); });
    draggable(b, function(target){ if (checked) return; var to = target.getAttribute("data-drop"); place(i, to === "pool" ? null : Number(to)); });
    return b;
  });
  function select(i){
    selected = i;
    chips.forEach(function(c, k){ c.setAttribute("aria-pressed", String(k === i)); });
    if (i != null) say("Elegido: " + game.items[i].text + ". Ahora elige su categoría.");
  }
  function place(i, ci){
    state[i] = ci; select(null); render();
    say(ci == null ? game.items[i].text + " vuelve a la lista." : game.items[i].text + " en " + game.categories[ci] + ".");
    var next = chips.filter(function(c, k){ return state[k] == null; })[0];
    if (next) next.focus(); else check.focus();
  }
  function render(){
    order.forEach(function(i){ (state[i] == null ? pool : zoneEls[state[i]]).appendChild(chips[i]); });
    check.disabled = state.some(function(s){ return s == null; });
    height();
  }
  var actions = el("div", "actions"); root.appendChild(actions);
  var check = el("button", "primary", "Comprobar"); check.type = "button"; actions.appendChild(check);
  var again = el("button", null, "Volver a jugar"); again.type = "button"; again.hidden = true; actions.appendChild(again);
  var score = el("span", "score"); score.id = "score"; actions.appendChild(score);
  check.addEventListener("click", function(){
    checked = true; var ok = 0;
    game.items.forEach(function(it, i){
      var right = game.categories[state[i]] === it.category; if (right) ok++;
      var c = chips[i]; c.disabled = true; c.classList.add(right ? "ok" : "bad");
      c.appendChild(el("span", "mark", right ? "✓" : "✗"));
      c.appendChild(el("span", "sr", right ? " (bien)" : " (mal)"));
      if (!right) c.appendChild(el("span", "why", "Va en «" + it.category + "»" + (it.explanation ? ": " + it.explanation : ".")));
    });
    finish(ok, game.items.length, check, again); height();
  });
  again.addEventListener("click", function(){ root.textContent = ""; classify(); });
  render();
}

function match(){
  var n = game.pairs.length, link = game.pairs.map(function(){ return null; }); // concepto → definición
  var selected = null, checked = false;
  root.appendChild(el("p", null, game.instructions));
  root.appendChild(el("p", "hint", "Toca un concepto y después su definición, o arrástralo encima. Para deshacer, toca el concepto otra vez."));
  var cols = el("div", "cols"); root.appendChild(cols);
  var left = el("div", "col"); left.appendChild(el("h2", null, "Conceptos")); cols.appendChild(left);
  var right = el("div", "col"); right.appendChild(el("h2", null, "Definiciones")); cols.appendChild(right);
  var defOrder = shuffle(game.pairs.map(function(_, i){ return i; }));
  var concepts = game.pairs.map(function(p, i){
    var b = el("button", null); b.type = "button"; b.setAttribute("aria-pressed", "false");
    onTap(b, function(){
      if (checked) return;
      if (link[i] != null) { link[i] = null; select(null); render(); say(p.concept + ": sin pareja."); return; }
      select(selected === i ? null : i);
    });
    draggable(b, function(target){ if (checked || target.getAttribute("data-drop") == null) return; pair(i, Number(target.getAttribute("data-drop"))); });
    left.appendChild(b); return b;
  });
  var defs = [];
  defOrder.forEach(function(d){
    var b = el("button", null); b.type = "button"; b.setAttribute("data-drop", String(d));
    onTap(b, function(){ if (!checked && selected != null) pair(selected, d); });
    right.appendChild(b); defs[d] = b;
  });
  function select(i){
    selected = i;
    concepts.forEach(function(c, k){ c.setAttribute("aria-pressed", String(k === i)); });
    if (i != null) say("Elegido: " + game.pairs[i].concept + ". Ahora elige su definición.");
  }
  function pair(i, d){
    link = link.map(function(x){ return x === d ? null : x; }); link[i] = d; select(null); render();
    say(game.pairs[i].concept + " unido a una definición.");
    var next = concepts.filter(function(c, k){ return link[k] == null; })[0];
    if (next) next.focus(); else check.focus();
  }
  function label(node, num, text){
    node.textContent = "";
    if (num != null) node.appendChild(el("span", "badge", String(num)));
    node.appendChild(document.createTextNode(text));
  }
  function render(){
    game.pairs.forEach(function(p, i){
      label(concepts[i], link[i] != null ? i + 1 : null, p.concept);
      concepts[i].setAttribute("aria-label", p.concept + (link[i] != null ? ", unido a la pareja " + (i + 1) : ""));
    });
    defs.forEach(function(b, d){
      var owner = link.indexOf(d);
      label(b, owner >= 0 ? owner + 1 : null, game.pairs[d].definition);
      b.setAttribute("aria-label", game.pairs[d].definition + (owner >= 0 ? ", pareja " + (owner + 1) + " con " + game.pairs[owner].concept : ""));
    });
    check.disabled = link.some(function(x){ return x == null; });
    height();
  }
  var actions = el("div", "actions"); root.appendChild(actions);
  var check = el("button", "primary", "Comprobar"); check.type = "button"; actions.appendChild(check);
  var again = el("button", null, "Volver a jugar"); again.type = "button"; again.hidden = true; actions.appendChild(again);
  var score = el("span", "score"); score.id = "score"; actions.appendChild(score);
  check.addEventListener("click", function(){
    checked = true; var ok = 0;
    game.pairs.forEach(function(p, i){
      var good = link[i] === i; if (good) ok++;
      var c = concepts[i]; c.disabled = true; c.classList.add(good ? "ok" : "bad");
      c.appendChild(el("span", "mark", good ? "✓" : "✗"));
      if (!good) c.appendChild(el("span", "why", p.definition));
    });
    defs.forEach(function(b){ b.disabled = true; });
    finish(ok, n, check, again); height();
  });
  again.addEventListener("click", function(){ root.textContent = ""; match(); });
  render();
}

if (game.kind === "classify") classify(); else if (game.kind === "match") match();
})();
`;

/** Documento completo del juego para el srcdoc del iframe. */
export function gameDocument(game: Game) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${GAME_CSP}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${STYLE}</style></head>
<body><main id="app"></main><div id="live" class="sr" aria-live="polite"></div>
<script type="application/json" id="data">${jsonForScript(game)}</script>
<script>${GAME_SCRIPT}</script></body></html>`;
}
