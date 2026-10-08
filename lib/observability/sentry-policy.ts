import type {
  ErrorEvent,
  TransactionEvent,
  StreamedSpanJSON,
} from "@sentry/core";
import { safeRoute, safeProperties } from "./policy";
function safeFrameFilename(value: string | undefined): string | undefined {
  if (!value) return;
  const clean = value.split(/[?#]/)[0];
  const asset = clean.match(
    /(?:_next\/static\/|app\/|components\/|lib\/|node_modules\/)[a-zA-Z0-9_./\[\]-]+\.(?:js|tsx?|mjs)$/,
  );
  return asset?.[0] || "[application]";
}
export function scrubError(event: ErrorEvent): ErrorEvent {
  const values = event.exception?.values?.slice(0, 3).map((value) => ({
    type: [
      "Error",
      "TypeError",
      "RangeError",
      "SyntaxError",
      "ReferenceError",
      "URIError",
    ].includes(value.type || "")
      ? value.type
      : "Error",
    value: "Error en Dream. Contenido omitido por privacidad.",
    stacktrace: value.stacktrace
      ? {
          frames: value.stacktrace.frames?.slice(-40).map((frame) => ({
            filename: safeFrameFilename(frame.filename),
            function: "[application]",
            lineno: frame.lineno,
            colno: frame.colno,
            in_app: frame.in_app,
          })),
        }
      : undefined,
  }));
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    environment:
      process.env.NODE_ENV === "production" ? "production" : "development",
    release: event.release,
    exception: values ? { values } : undefined,
    message: values ? undefined : "Evento de diagnóstico de Dream",
    tags: Object.fromEntries(
      Object.entries(
        safeProperties({
          ...event.tags,
          http_status: Number(event.tags?.http_status),
          duration_ms: Number(event.tags?.duration_ms),
        }),
      ).map(([key, value]) => [key, String(value)]),
    ),
    transaction: safeRoute(event.transaction),
  };
}
export function scrubSpan(span: StreamedSpanJSON): StreamedSpanJSON {
  return {
    trace_id: span.trace_id,
    parent_span_id: span.parent_span_id,
    span_id: span.span_id,
    name: /^(?:(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) )?\//.test(span.name)
      ? safeRoute(
          span.name.replace(/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /, ""),
        )
      : "Dream operation",
    start_timestamp: span.start_timestamp,
    end_timestamp: span.end_timestamp,
    status: span.status,
    is_segment: span.is_segment,
    attributes: { "sentry.op": "dream.operation" },
  };
}
export function scrubTransaction(
  event: TransactionEvent,
): TransactionEvent | null {
  return {
    type: "transaction",
    event_id: event.event_id,
    timestamp: event.timestamp,
    start_timestamp: event.start_timestamp,
    transaction: safeRoute(event.transaction),
    environment:
      process.env.NODE_ENV === "production" ? "production" : "development",
    release: event.release,
    platform: event.platform,
    contexts: event.contexts?.trace
      ? {
          trace: {
            trace_id: event.contexts.trace.trace_id,
            span_id: event.contexts.trace.span_id,
            op: "dream.request",
          },
        }
      : undefined,
    spans: event.spans?.map((span) => ({
      span_id: span.span_id,
      trace_id: span.trace_id,
      parent_span_id: span.parent_span_id,
      start_timestamp: span.start_timestamp,
      timestamp: span.timestamp,
      status: span.status,
      op: "dream.operation",
      description: "Dream operation",
      data: {},
    })),
  };
}
export const sentryPrivacy = {
  sendDefaultPii: false,
  enableLogs: false,
  maxBreadcrumbs: 0,
  beforeBreadcrumb: () => null,
  beforeSend: scrubError,
  beforeSendSpan: scrubSpan,
  tracePropagationTargets: [],
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
    frameContextLines: 0,
  },
};
