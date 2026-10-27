import * as Sentry from "npm:@sentry/deno@11.5.0";
const dsn = Deno.env.get("DREAM_EDGE_SENTRY_DSN");
const environment =
  Deno.env.get("DREAM_ENVIRONMENT") === "production"
    ? "production"
    : Deno.env.get("DREAM_ENVIRONMENT") === "preview"
      ? "preview"
      : "development";
const operations = new Set([
  "chat",
  "attachment_upload",
  "test_generate",
  "scheme_generate",
  "scheme_get",
  "scheme_update",
  "scheme_refine",
  "scheme_illustrate",
  "game_generate",
  "game_get",
  "game_result",
  "dreams_list",
  "test_check_answer",
  "test_submit",
  "exam_prepare",
  "exam_session_create",
  "exam_session_submit",
]);
if (dsn)
  Sentry.init({
    dsn,
    environment,
    integrations: [],
    defaultIntegrations: false,
    tracePropagationTargets: [],
    enableOpenTelemetrySetup: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 0,
    beforeSend: (event) => ({
      type: undefined,
      event_id: event.event_id,
      timestamp: event.timestamp,
      platform: "javascript",
      level: "error",
      environment,
      exception: {
        values: [
          {
            type: "Error",
            value: "Dream Edge operation failed. Private content omitted.",
          },
        ],
      },
      tags: {
        operation: operations.has(String(event.tags?.operation))
          ? String(event.tags?.operation)
          : "other",
        code: /^[a-z_]{1,50}$/.test(String(event.tags?.code))
          ? String(event.tags?.code)
          : "edge_failure",
      },
    }),
  });
export function captureEdgeFailure(operation: string, code: string) {
  const safeOperation = operations.has(operation) ? operation : "other";
  const safeCode = /^[a-z_]{1,50}$/.test(code) ? code : "edge_failure";
  console.error(
    JSON.stringify({
      event: "dream_edge_failure",
      operation: safeOperation,
      code: safeCode,
    }),
  );
  if (dsn)
    Sentry.captureException(new Error("Dream Edge operation failed"), {
      tags: { operation: safeOperation, code: safeCode },
    });
}
