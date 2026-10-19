import test, { mock } from "node:test";
import assert from "node:assert/strict";
import {
  UPLOAD_POLL,
  isFinished,
  msLeft,
  nextPollDelay,
  shouldRenew,
  statusSignature,
  watchUploadSession,
  type UploadSessionStatus,
} from "../lib/upload-session";
import { TOKEN_PATTERN, isInvalidLink, UploadQrError } from "../lib/upload-qr";
import { isPrivatePath } from "../lib/observability/privacy";

const NOW = Date.parse("2026-10-17T10:00:00Z");
const status = (
  over: Partial<UploadSessionStatus> = {},
): UploadSessionStatus => ({
  id: "s",
  state: "open",
  connected: false,
  connected_at: null,
  expires_at: "2026-10-17T10:10:00Z",
  uploads: 0,
  max_uploads: 10,
  files: [],
  ...over,
});

test("expiry: time left, renew window and finished states", () => {
  assert.equal(msLeft("2026-10-17T10:10:00Z", NOW), 600_000);
  assert.equal(msLeft("2026-10-17T09:59:00Z", NOW), 0);
  assert.equal(msLeft("no es fecha", NOW), 0);
  assert.equal(shouldRenew("2026-10-17T10:10:00Z", NOW), false);
  assert.equal(shouldRenew("2026-10-17T10:01:59Z", NOW), true);
  // Already expired: renewing would fail, the panel offers a new code instead.
  assert.equal(shouldRenew("2026-10-17T09:59:59Z", NOW), false);
  assert.equal(isFinished(status({ state: "expired" })), true);
  assert.equal(isFinished(status({ state: "closed" })), true);
  assert.equal(isFinished(status({ state: "connected" })), false);
});

test("polling backs off while nothing changes and resets on change", () => {
  let delay: number = UPLOAD_POLL.minMs;
  const seen: number[] = [];
  for (let i = 0; i < 6; i++)
    seen.push((delay = nextPollDelay(delay, false, false)));
  assert.deepEqual(seen, [2400, 3840, 6000, 6000, 6000, 6000]);
  assert.equal(nextPollDelay(6000, true, false), UPLOAD_POLL.minMs);
  assert.equal(nextPollDelay(6000, false, true), UPLOAD_POLL.minMs);
});

test("signature ignores the expiry but sees connection and file states", () => {
  const a = status();
  assert.equal(statusSignature(a), statusSignature({ ...a, expires_at: "x" }));
  assert.notEqual(
    statusSignature(a),
    statusSignature({ ...a, connected: true }),
  );
  const file = {
    id: "f",
    attachment_id: null,
    file_name: "a.pdf",
    size_bytes: 1,
    status: "processing" as const,
    created_at: "",
  };
  const b = status({ files: [file] });
  assert.notEqual(
    statusSignature(b),
    statusSignature(status({ files: [{ ...file, status: "processed" }] })),
  );
});

test("watch: reports changes only, backs off, stops when expired or aborted", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const flush = async (ms: number) => {
    mock.timers.tick(ms);
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  try {
    const answers = [
      status(),
      status(),
      status({ state: "connected", connected: true }),
      status({ state: "expired", connected: true }),
    ];
    let calls = 0;
    const seen: string[] = [];
    watchUploadSession(
      "s",
      { onStatus: (s) => seen.push(s.state) },
      new AbortController().signal,
      {
        fetchStatus: async () => answers[calls++],
        hidden: () => false,
      },
    );
    await flush(0); // open
    await flush(UPLOAD_POLL.minMs); // same: backs off to 2400
    assert.equal(calls, 2);
    await flush(UPLOAD_POLL.minMs);
    assert.equal(calls, 2, "waits longer after no change");
    await flush(2400 - UPLOAD_POLL.minMs); // connected
    await flush(UPLOAD_POLL.minMs); // expired: stop
    await flush(60_000);
    assert.equal(calls, 4);
    assert.deepEqual(seen, ["open", "connected", "expired"]);

    // Hidden tab: no requests; aborted: nothing more.
    let hiddenCalls = 0;
    let hidden = false;
    const abort = new AbortController();
    watchUploadSession("s", { onStatus: () => {} }, abort.signal, {
      fetchStatus: async () => (hiddenCalls++, status()),
      hidden: () => hidden,
    });
    await flush(0);
    hidden = true;
    await flush(60_000);
    assert.equal(hiddenCalls, 1);
    abort.abort();
    hidden = false;
    await flush(60_000);
    assert.equal(hiddenCalls, 1);
  } finally {
    mock.timers.reset();
  }
});

test("phone side: token shape and the single invalid-link case", () => {
  assert.match("q3Zr-9_xK2mPa7LbV0cT1uWnE8sYdHjF4gOiR6kXyQe", TOKEN_PATTERN);
  assert.doesNotMatch("corto", TOKEN_PATTERN);
  assert.doesNotMatch(
    "q3Zr-9_xK2mPa7LbV0cT1uWnE8sYdHjF4gOiR6kXyQe/",
    TOKEN_PATTERN,
  );
  assert.equal(
    isInvalidLink(new UploadQrError("x", 404, "upload_link_invalid")),
    true,
  );
  assert.equal(
    isInvalidLink(new UploadQrError("x", 409, "upload_quota")),
    false,
  );
});

test("the upload link never reaches analytics or diagnostics", () => {
  assert.equal(isPrivatePath("/subir/abc"), true);
  assert.equal(isPrivatePath("/subir"), true);
  assert.equal(isPrivatePath("/subirse"), false);
  assert.equal(isPrivatePath("/exams/new"), false);
});
