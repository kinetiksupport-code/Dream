import { deploymentEnvironment } from "./environment";
import { readPrivacy } from "./privacy";
import {
  events,
  safeProperties,
  type AnalyticsEvent,
  type SafeProperties,
} from "./policy";
import type { PostHog } from "posthog-js";
let client: PostHog | undefined;
let loading: Promise<void> | undefined;
let generation = 0;
const queue: { event: AnalyticsEvent; properties: SafeProperties }[] = [];
export const analyticsConfigured = () =>
  !!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN &&
  !!process.env.NEXT_PUBLIC_POSTHOG_HOST;
export async function syncAnalytics(): Promise<void> {
  if (!readPrivacy().analytics || !analyticsConfigured()) {
    generation++;
    queue.length = 0;
    client?.opt_out_capturing();
    client?.reset();
    return;
  }
  if (client) {
    client.opt_in_capturing({ captureEventName: false });
    return;
  }
  if (loading) return loading;
  const current = generation;
  loading = (async () => {
    const { default: posthog } = await import("posthog-js");
    if (current !== generation || !readPrivacy().analytics) return;
    client = posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST!,
      autocapture: false,
      rageclick: false,
      capture_dead_clicks: false,
      disable_surveys: true,
      enable_heatmaps: false,
      capture_pageview: false,
      save_referrer: false,
      save_campaign_params: false,
      disable_capture_url_hashes: true,
      capture_pageleave: false,
      capture_exceptions: false,
      disable_session_recording: true,
      person_profiles: "never",
      opt_out_capturing_by_default: true,
      respect_dnt: true,
      persistence: "localStorage",
      advanced_disable_flags: true,
      before_send: (event) => {
        if (
          !event ||
          !readPrivacy().analytics ||
          !events.includes(event.event as AnalyticsEvent)
        )
          return null;
        // Keep only the SDK-generated anonymous identifier and project routing token.
        const id = event.properties.distinct_id;
        if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return null;
        event.properties = {
          ...safeProperties(event.properties),
          distinct_id: id,
          token: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
          $geoip_disable: true,
        };
        return event;
      },
    });
    client.opt_in_capturing({ captureEventName: false });
    for (const item of queue.splice(0))
      client.capture(item.event, item.properties);
  })().finally(() => {
    loading = undefined;
  });
  return loading;
}
export function track(
  event: AnalyticsEvent,
  properties: SafeProperties = {},
): void {
  if (
    typeof window === "undefined" ||
    !readPrivacy().analytics ||
    !analyticsConfigured()
  )
    return;
  const safe = safeProperties({
    ...properties,
    environment: deploymentEnvironment(),
  });
  if (client && !client.has_opted_out_capturing()) client.capture(event, safe);
  else {
    if (queue.length < 50) queue.push({ event, properties: safe });
    void syncAnalytics().catch(() => {
      queue.length = 0;
    });
  }
}
export function resetAnalytics(): void {
  queue.length = 0;
  client?.reset();
}
