import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";

type ExtendableEventLike = {
  waitUntil: (promise: Promise<unknown>) => void;
};
type Listener = (event: ExtendableEventLike) => void;

test("activate only deletes old Dream caches and preserves unrelated caches", async () => {
  const listeners = new Map<string, Listener>();
  const cacheNames = [
    "dream-static-v1",
    "unrelated-cache",
    "dream-static-v3",
    "dream-static-v2",
    "dream-staticly-v1",
    "another-app-cache",
  ];
  const deleted: string[] = [];
  const selfMock = {
    addEventListener: (name: string, listener: Listener) => {
      listeners.set(name, listener);
    },
    clients: { claim: () => Promise.resolve() },
    skipWaiting: () => Promise.resolve(),
  };
  const cachesMock = {
    keys: async () => [...cacheNames],
    delete: async (name: string) => {
      deleted.push(name);
      return true;
    },
  };

  runInNewContext(
    readFileSync(join(process.cwd(), "public", "sw.js"), "utf8"),
    { self: selfMock, caches: cachesMock },
  );

  const activate = listeners.get("activate");
  assert.ok(activate);
  let activation: Promise<unknown> | undefined;
  activate({ waitUntil: (promise) => (activation = promise) });
  assert.ok(activation);
  await activation;

  assert.deepEqual(deleted, ["dream-static-v1", "dream-static-v2"]);
  assert.deepEqual(
    cacheNames.filter((name) => !deleted.includes(name)),
    [
      "unrelated-cache",
      "dream-static-v3",
      "dream-staticly-v1",
      "another-app-cache",
    ],
  );
});
