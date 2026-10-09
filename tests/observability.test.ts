import * as Sentry from "@sentry/nextjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  safeProperties,
  sectionForPath,
  safeRoute,
} from "../lib/observability/policy";
import {
  scrubError,
  scrubSpan,
  scrubTransaction,
} from "../lib/observability/sentry-policy";
import { readPrivacy } from "../lib/observability/privacy";
import type {
  Envelope,
  ErrorEvent,
  StreamedSpanJSON,
  TransactionEvent,
} from "@sentry/core";
const privateText =
  "private@example.test Bearer eyJ.secret.prompt Ecuaciones.pdf";
test("telemetry allowlist excludes identities and academic content at every boundary", () => {
  const safe = safeProperties({
    action: "chat",
    section: "chat",
    http_status: 429,
    duration_ms: 27.9,
    outcome: "http_error",
    prompt: privateText,
    answer: privateText,
    email: privateText,
    file_name: privateText,
    conversation_id: privateText,
  });
  assert.deepEqual(safe, {
    action: "chat",
    section: "chat",
    http_status: 429,
    duration_ms: 28,
    outcome: "http_error",
  });
  assert.deepEqual(
    safeProperties({
      action: privateText,
      section: privateText,
      outcome: privateText,
      http_status: 700,
      duration_ms: NaN,
    }),
    {},
  );
});
test("route aggregation removes IDs, query strings and unknown routes", () => {
  assert.equal(
    sectionForPath("/exams/private-id/study/private-unit?prompt=secret"),
    "exams",
  );
  assert.equal(safeRoute("/tests/secret?token=secret"), "/tests");
  assert.equal(safeRoute("https://private.test/path?secret=secret"), "/other");
});
test("Sentry errors omit payloads, identities, source context and arbitrary metadata", () => {
  const event: ErrorEvent = {
    type: undefined,
    event_id: "a".repeat(32),
    tags: { action: "chat", http_status: "429", prompt: privateText },
    user: { email: privateText },
    message: privateText,
    request: { url: privateText, data: privateText },
    breadcrumbs: [{ message: privateText }],
    extra: { prompt: privateText },
    contexts: { arbitrary: { secret: privateText } },
    exception: {
      values: [
        {
          type: privateText,
          value: privateText,
          stacktrace: {
            frames: [
              {
                filename:
                  "https://dream.test/_next/static/chunks/app.js?token=secret",
                function: privateText,
                lineno: 12,
                vars: { secret: privateText },
                pre_context: [privateText],
              },
            ],
          },
        },
      ],
    },
  };
  const result = scrubError(event);
  assert.ok(!JSON.stringify(result).includes(privateText));
  assert.ok(!JSON.stringify(result).includes("token=secret"));
  assert.equal(
    result.exception?.values?.[0].stacktrace?.frames?.[0].lineno,
    12,
  );
  assert.equal(result.tags?.http_status, "429");
  assert.equal(result.request, undefined);
  assert.equal(result.user, undefined);
});
test("streamed and legacy Sentry traces discard span descriptions, attributes and links", () => {
  const span: StreamedSpanJSON = {
    trace_id: "a".repeat(32),
    span_id: "b".repeat(16),
    name: privateText,
    start_timestamp: 1,
    end_timestamp: 2,
    status: "ok",
    is_segment: true,
    attributes: { prompt: privateText },
    links: [
      {
        trace_id: "a".repeat(32),
        span_id: "b".repeat(16),
        attributes: { secret: privateText },
      },
    ],
  };
  assert.ok(!JSON.stringify(scrubSpan(span)).includes(privateText));
  assert.equal(
    scrubSpan({ ...span, name: "GET /exams/private-id?prompt=secret" }).name,
    "/exams",
  );
  const event: TransactionEvent = {
    type: "transaction",
    transaction: "/chat/private-id?prompt=secret",
    contexts: {
      user: { email: privateText },
      trace: {
        trace_id: "a".repeat(32),
        span_id: "b".repeat(16),
        data: { secret: privateText },
      },
    },
    extra: { secret: privateText },
    spans: [
      {
        trace_id: "a".repeat(32),
        span_id: "b".repeat(16),
        status: "ok",
        start_timestamp: 1,
        description: privateText,
        data: { secret: privateText },
      },
    ],
  };
  const result = scrubTransaction(event);
  assert.ok(!JSON.stringify(result).includes(privateText));
  assert.equal(result?.transaction, "/chat");
});
test("telemetry is off without browser consent", () => {
  assert.deepEqual(readPrivacy(), { analytics: false, diagnostics: false });
});

test("real Sentry SDK transport receives an envelope scrubbed by the installed hooks", async () => {
  const { sentryPrivacy } = await import("../lib/observability/sentry-policy");
  const envelopes: unknown[] = [];
  Sentry.init({
    ...sentryPrivacy,
    // Test-only transport: never contacts a Sentry project or claims live delivery.
    dsn: "https://testpublickey@telemetry.invalid/1",
    defaultIntegrations: false,
    tracesSampleRate: 0,
    transport: () => ({
      send: async (envelope: Envelope) => {
        envelopes.push(envelope);
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  });
  const id = Sentry.captureException(new Error(privateText), {
    user: { email: privateText },
    extra: { prompt: privateText },
  });
  assert.match(id, /^[a-f0-9]{32}$/);
  await Sentry.flush(5000);
  assert.ok(envelopes.length > 0);
  assert.ok(!JSON.stringify(envelopes).includes(privateText));
  await Sentry.close(1000);
});
test("preview environment is not misclassified as production and arbitrary labels are rejected", async () => {
  const { environmentFor } = await import("../lib/observability/environment");
  assert.equal(environmentFor("preview"), "preview");
  assert.equal(environmentFor("production"), "production");
  assert.equal(environmentFor("private-prompt"), "development");
  assert.equal(
    safeProperties({ environment: "preview" }).environment,
    "preview",
  );
  assert.equal(
    safeProperties({ environment: "private-prompt" }).environment,
    undefined,
  );
});
