import test from "node:test";
import assert from "node:assert/strict";
import {
  createCrisp,
  CrispUnavailable,
  CRISP_SCRIPT,
  noticeAccepted,
  rememberNotice,
  type CrispWindow,
} from "../lib/crisp";

type Command = unknown[];
function setup({ loads = true, opens = true } = {}) {
  const win: CrispWindow = {};
  const scripts: { src: string; async: boolean; onerror: ((e: Event) => void) | null }[] = [];
  const commands: Command[] = [];
  let opened = false;
  const crisp = createCrisp({
    win,
    websiteId: "site-id",
    loadTimeoutMs: 50,
    checkMs: 0,
    wait: async () => {},
    createScript: () => ({ src: "", async: false, onerror: null }),
    appendScript: (script) => {
      scripts.push(script);
      setTimeout(() => {
        if (!loads) return script.onerror?.(new Event("error"));
        // The real SDK replays the queue and replaces $crisp.
        const queued = win.$crisp as Command[];
        commands.push(...queued);
        win.$crisp = {
          push: (c: Command) => {
            commands.push(c);
            if (opens && c[1] === "chat:open") opened = true;
            if (c[1] === "chat:hide") opened = false;
          },
          is: () => opened,
        };
        win.CRISP_READY_TRIGGER?.();
      }, 1);
    },
  });
  return { crisp, win, scripts, commands };
}

test("nothing is loaded until the student asks for the chat", () => {
  const { scripts, win } = setup();
  assert.equal(scripts.length, 0);
  assert.equal(win.$crisp, undefined);
});

test("the script is inserted once, with the site id and the bubble hidden", async () => {
  const { crisp, scripts, win, commands } = setup();
  await Promise.all([crisp.load(), crisp.load()]);
  await crisp.open();
  await crisp.open();
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, CRISP_SCRIPT);
  assert.equal(scripts[0].async, true);
  assert.equal(win.CRISP_WEBSITE_ID, "site-id");
  assert.deepEqual(win.CRISP_RUNTIME_CONFIG, { locale: "es" });
  assert.deepEqual(commands[0], ["do", "chat:hide"]);
  assert.equal(commands[1][0], "on");
  assert.equal(commands[1][1], "chat:closed");
  assert.ok(commands.some((c) => c[1] === "chat:show"));
  assert.ok(commands.some((c) => c[1] === "chat:open"));
  // Nothing about the student is sent.
  assert.ok(!commands.some((c) => c[0] === "set"));
});

test("closing the chat hides it again", async () => {
  const { crisp, commands } = setup();
  await crisp.open();
  const onClosed = commands.find((c) => c[1] === "chat:closed")?.[2] as () => void;
  onClosed();
  assert.deepEqual(commands.at(-1), ["do", "chat:hide"]);
});

test("a blocked script fails quietly and can be retried", async () => {
  const { crisp, scripts } = setup({ loads: false });
  await assert.rejects(crisp.open(), (e: unknown) => e instanceof CrispUnavailable && e.reason === "load_failed");
  await assert.rejects(crisp.open());
  assert.equal(scripts.length, 2);
});

test("if the chat never appears it retries 3 times, then gives up", async () => {
  const { crisp, commands } = setup({ opens: false });
  await assert.rejects(crisp.open(), (e: unknown) => e instanceof CrispUnavailable && e.reason === "not_opened");
  assert.equal(commands.filter((c) => c[1] === "chat:open").length, 3);
});

test("the notice is remembered, and blocked storage never breaks the button", () => {
  const map = new Map<string, string>();
  const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
  assert.equal(noticeAccepted(storage), false);
  rememberNotice(storage);
  assert.equal(noticeAccepted(storage), true);
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(noticeAccepted(blocked), false);
  assert.doesNotThrow(() => rememberNotice(blocked));
  assert.equal(noticeAccepted(null), false);
});
