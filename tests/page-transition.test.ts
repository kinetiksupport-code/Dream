// Page transitions (PROMPT_EXAMEN_ESTILO.md §3): direction rules and which
// clicks start a transition.
import test from "node:test";
import assert from "node:assert/strict";
import {
  ancestors,
  linkTarget,
  routeDirection,
  routeKey,
  VT_MAX_WAIT_MS,
} from "../lib/page-transition";

test("the route key keeps the path and the params that switch the view", () => {
  assert.equal(routeKey("/chat", "?view=recent"), "/chat?view=recent");
  assert.equal(routeKey("/chat", "?c=1&utm=x"), "/chat?c=1");
  assert.equal(routeKey("/tasks/", ""), "/tasks");
  assert.equal(routeKey("/", ""), "/");
  assert.equal(
    routeKey("/exams/new", new URLSearchParams("id=9")),
    "/exams/new",
  );
});

test("ancestors follow the URL and «Más» on phones", () => {
  assert.deepEqual(ancestors("/exams/1/ruta"), ["/exams/1", "/exams", "/more"]);
  assert.deepEqual(ancestors("/tasks"), []);
  assert.deepEqual(ancestors("/settings"), ["/more"]);
});

test("into a detail is forward, out of it is back, sections are lateral", () => {
  assert.equal(routeDirection("/exams", "/exams/1"), "forward");
  assert.equal(routeDirection("/exams/1", "/exams"), "back");
  assert.equal(routeDirection("/exams/1/ruta", "/exams"), "back");
  assert.equal(routeDirection("/more", "/exams"), "forward");
  assert.equal(routeDirection("/exams", "/more"), "back");
  assert.equal(routeDirection("/tasks", "/notes"), "lateral");
  assert.equal(routeDirection("/exams/1", "/exams/2"), "lateral");
  assert.equal(routeDirection("/chat", "/tasks"), "lateral");
  // Inicio → a conversation and back; Historial is a sibling view.
  assert.equal(routeDirection("/chat", "/chat?c=1"), "forward");
  assert.equal(routeDirection("/chat?c=1", "/chat"), "back");
  assert.equal(routeDirection("/chat", "/chat?view=recent"), "lateral");
  assert.equal(routeDirection("/chat?view=recent", "/chat?c=1"), "forward");
  assert.equal(routeDirection("/chat?c=1", "/chat?c=2"), "lateral");
});

test("browser Back always reverses, whatever the hierarchy says", () => {
  assert.equal(routeDirection("/tasks", "/notes", "back"), "back");
  assert.equal(routeDirection("/exams", "/exams/1", "back"), "back");
  assert.equal(routeDirection("/exams/1", "/exams", "forward"), "forward");
});

test("no transition when nothing changes", () => {
  assert.equal(routeDirection("/tasks", "/tasks"), null);
  assert.equal(routeDirection(null, "/tasks"), null);
});

const click = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
};
const link = (href: string, extra: Partial<Parameters<typeof linkTarget>[1]> = {}) => ({
  href,
  target: null,
  download: false,
  optOut: false,
  ...extra,
});
const here = { href: "https://dream.test/tasks", origin: "https://dream.test" };

test("only plain clicks on internal links to another page start a transition", () => {
  assert.equal(linkTarget(click, link("/notes"), here), "/notes");
  assert.equal(
    linkTarget(click, link("https://dream.test/chat?view=recent"), here),
    "/chat?view=recent",
  );
  // Same page, another site, new tab, download, modifier keys, opt-out.
  assert.equal(linkTarget(click, link("/tasks#x"), here), null);
  assert.equal(linkTarget(click, link("https://otra.web/x"), here), null);
  assert.equal(linkTarget(click, link("/notes", { target: "_blank" }), here), null);
  assert.equal(linkTarget(click, link("/notes", { download: true }), here), null);
  assert.equal(linkTarget(click, link("/notes", { optOut: true }), here), null);
  assert.equal(linkTarget({ ...click, metaKey: true }, link("/notes"), here), null);
  assert.equal(linkTarget({ ...click, button: 1 }, link("/notes"), here), null);
  assert.equal(
    linkTarget({ ...click, defaultPrevented: true }, link("/notes"), here),
    null,
  );
});

test("the screen never waits long for a slow route", () => {
  assert.ok(VT_MAX_WAIT_MS <= 300);
});
