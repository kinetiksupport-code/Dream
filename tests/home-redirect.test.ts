// Con la sesión iniciada, edudream.es lleva a Inicio (/chat) antes de pintar.
import test from "node:test";
import assert from "node:assert/strict";
import { HOME_REDIRECT_BOOT } from "../lib/theme";

function run(path: string, search: string, store: Record<string, string>) {
  let replaced: string | null = null;
  const keys = Object.keys(store);
  const localStorage = {
    length: keys.length,
    key: (i: number) => keys[i] ?? null,
    getItem: (k: string) => store[k] ?? null,
  };
  const location = { pathname: path, search, replace: (u: string) => (replaced = u) };
  new Function("localStorage", "location", HOME_REDIRECT_BOOT)(localStorage, location);
  return replaced;
}
const session = { "sb-cxaujyagtpsxvkwkdxbc-auth-token": JSON.stringify({ access_token: "a", refresh_token: "r" }) };

test("con sesión, la portada lleva a /chat", () => {
  assert.equal(run("/", "", session), "/chat");
});
test("sin sesión, o con solo el code-verifier, se queda en la landing", () => {
  assert.equal(run("/", "", {}), null);
  assert.equal(run("/", "", { "sb-x-auth-token-code-verifier": "\"v\"" }), null);
  assert.equal(run("/", "", { "sb-x-auth-token": "null" }), null);
});
test("solo en la portada, y «?landing» la enseña igualmente", () => {
  assert.equal(run("/blog", "", session), null);
  assert.equal(run("/privacidad", "", session), null);
  assert.equal(run("/", "?landing", session), null);
  assert.equal(run("/", "?landing=1", session), null);
});
test("un valor roto no rompe la página", () => {
  assert.equal(run("/", "", { "sb-x-auth-token": "{roto" }), null);
});
