import { readPrivacy } from "./privacy";
import { sentryPrivacy } from "./sentry-policy";
import { safeProperties, type SafeProperties } from "./policy";
import type * as Sentry from "@sentry/nextjs";
let sdk: typeof Sentry | undefined;
let loading: Promise<void> | undefined;
let enabled = false;
export const diagnosticsConfigured = () => !!process.env.NEXT_PUBLIC_SENTRY_DSN;
export async function syncDiagnostics(): Promise<void> {
  if (!diagnosticsConfigured() || !readPrivacy().diagnostics) {
    enabled = false;
    if (sdk) await sdk.close(0);
    return;
  }
  if (enabled) return;
  if (loading) return loading;
  loading = (async () => {
    const sentryModule = await import("@sentry/nextjs");
    if (!readPrivacy().diagnostics) return;
    sdk = sentryModule;
    sdk.init({
      ...sentryPrivacy,
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment:
        process.env.NODE_ENV === "production" ? "production" : "development",
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    });
    enabled = true;
  })().finally(() => {
    loading = undefined;
  });
  return loading;
}
export function captureDiagnostic(
  error: unknown,
  properties: SafeProperties = {},
): void {
  if (!enabled || !readPrivacy().diagnostics) return;
  sdk?.captureException(
    error instanceof Error ? error : new Error("Dream failure"),
    {
      tags: Object.fromEntries(
        Object.entries(safeProperties(properties)).map(([key, value]) => [
          key,
          String(value),
        ]),
      ),
    },
  );
}
export function onRouterTransitionStart(
  ...args: Parameters<typeof Sentry.captureRouterTransitionStart>
): void {
  if (enabled && readPrivacy().diagnostics)
    sdk?.captureRouterTransitionStart(...args);
}
export async function verifyDiagnostics(): Promise<string | undefined> {
  await syncDiagnostics();
  if (!enabled) return;
  const id = sdk?.captureException(
    new Error("Dream observability verification"),
  );
  await sdk?.flush(5000);
  return id;
}
