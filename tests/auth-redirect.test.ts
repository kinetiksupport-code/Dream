import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_ERRORS,
  callbackError,
  canonicalRedirect,
  exchangeError,
  getAuthRedirectUrl,
  isAuthErrorCode,
  siteOrigin,
} from "../lib/auth-redirect";

const SITE = "https://www.edudream.es";

test("production always returns to the canonical site, whatever the host", () => {
  for (const origin of [
    "https://www.edudream.es",
    "https://edudream.es",
    "https://edudream.vercel.app",
    "https://dream-abc123-kinetik1.vercel.app",
  ])
    assert.equal(
      getAuthRedirectUrl({ origin, siteUrl: SITE, environment: "production" }),
      "https://www.edudream.es/auth/callback",
      origin,
    );
});

test("previews and localhost return to their own origin", () => {
  assert.equal(
    getAuthRedirectUrl({
      origin: "https://dream-git-fix-login-kinetik1.vercel.app",
      siteUrl: SITE,
      environment: "preview",
    }),
    "https://dream-git-fix-login-kinetik1.vercel.app/auth/callback",
  );
  for (const origin of ["http://localhost:3000", "http://127.0.0.1:3201"])
    assert.equal(
      getAuthRedirectUrl({ origin, siteUrl: SITE, environment: "production" }),
      `${origin}/auth/callback`,
    );
  assert.equal(
    getAuthRedirectUrl({
      origin: "http://localhost:3000",
      siteUrl: SITE,
      environment: "development",
    }),
    "http://localhost:3000/auth/callback",
  );
});

test("a missing or malformed site URL falls back to the page origin", () => {
  for (const siteUrl of [undefined, "", "not a url", "http://www.edudream.es"])
    assert.equal(
      getAuthRedirectUrl({
        origin: "https://edudream.vercel.app",
        siteUrl,
        environment: "production",
      }),
      "https://edudream.vercel.app/auth/callback",
      String(siteUrl),
    );
  assert.equal(siteOrigin(" https://www.edudream.es/ "), SITE);
  assert.equal(siteOrigin("https://www.edudream.es/algo?x=1"), SITE);
});

const redirect = (
  href: string,
  extra: Partial<Parameters<typeof canonicalRedirect>[0]> = {},
) =>
  canonicalRedirect({
    url: new URL(href),
    method: "GET",
    siteUrl: SITE,
    environment: "production",
    ...extra,
  })?.href ?? null;

test("secondary production hosts redirect to www, keeping path and query", () => {
  assert.equal(
    redirect("https://edudream.vercel.app/login?expired=1"),
    "https://www.edudream.es/login?expired=1",
  );
  assert.equal(
    redirect("https://edudream.es/chat"),
    "https://www.edudream.es/chat",
  );
  assert.equal(
    redirect("https://edudream.vercel.app/maintenance"),
    "https://www.edudream.es/maintenance",
  );
});

test("the canonical host, APIs, non-GET, previews and local are never redirected", () => {
  assert.equal(redirect("https://www.edudream.es/login"), null);
  assert.equal(redirect("https://www.edudream.es:8443/login"), null);
  assert.equal(
    redirect("https://edudream.vercel.app/api/auth/verify-maintenance"),
    null,
  );
  assert.equal(redirect("https://edudream.vercel.app/_next/data/x.json"), null);
  assert.equal(
    redirect("https://edudream.vercel.app/login", { method: "POST" }),
    null,
  );
  assert.equal(
    redirect("https://dream-git-x-kinetik1.vercel.app/login", {
      environment: "preview",
    }),
    null,
  );
  assert.equal(redirect("http://localhost:3000/login"), null);
  assert.equal(
    redirect("https://edudream.vercel.app/login", { siteUrl: "" }),
    null,
  );
});

test("callback errors become short codes with a Spanish message", () => {
  assert.equal(callbackError(""), null);
  assert.equal(callbackError("?code=abc"), null);
  assert.equal(
    callbackError("?error=access_denied&error_description=User+denied"),
    "cancelled",
  );
  assert.equal(
    callbackError(
      "",
      "#error=server_error&error_description=Unable+to+exchange",
    ),
    "oauth",
  );
  assert.equal(
    callbackError(
      "?error=invalid_request&error_description=code+verifier+missing",
    ),
    "other-origin",
  );
  assert.equal(
    exchangeError("invalid flow state, no valid flow state found"),
    "other-origin",
  );
  assert.equal(exchangeError("network"), "session");
  for (const [code, text] of Object.entries(AUTH_ERRORS)) {
    assert.ok(isAuthErrorCode(code));
    assert.match(text, /[.]$/);
  }
  assert.equal(isAuthErrorCode("<script>"), false);
  assert.equal(isAuthErrorCode("toString"), false);
});
