import * as Sentry from "@sentry/nextjs";
import { sentryPrivacy } from "./lib/observability/sentry-policy";
if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)
  Sentry.init({
    ...sentryPrivacy,
    dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment:
      process.env.NODE_ENV === "production" ? "production" : "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
  });
