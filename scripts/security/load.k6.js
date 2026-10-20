import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";
const base = __ENV.DREAM_LOAD_URL || "http://127.0.0.1:3400";
if (!/^http:\/\/(127\.0\.0\.1|localhost):3400$/.test(base))
  throw new Error("Isolated harness only; production loads are not authorized");
const rejection = new Rate("controlled_429"),
  unexpected = new Rate("unexpected_errors"),
  ttft = new Trend("synthetic_ttft_ms", true);
export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || "15s",
  summaryTrendStats: ["avg", "p(50)", "p(95)", "p(99)", "max"],
  thresholds: {
    unexpected_errors: ["rate<0.01"],
    "http_req_duration{kind:read}": ["p(95)<500", "p(99)<1000"],
  },
};
let token;
export default function workload() {
  if (!token) {
    const r = http.post(base + "/test/login", null, {
      headers: { "x-test-user": String(__VU) },
      tags: { kind: "auth" },
    });
    check(r, { "synthetic auth succeeds": (r) => r.status === 200 });
    token = r.json("token");
  }
  const params = {
    headers: { Authorization: "Bearer " + token },
    tags: { kind: "read" },
  };
  for (const path of ["/conversations", "/exams", "/plan"]) {
    const r = http.get(base + path, params);
    unexpected.add(r.status !== 200);
    check(r, { "saved reads remain accessible": (r) => r.status === 200 });
  }
  if (__ENV.AI !== "0") {
    const path = Math.random() < 0.2 ? "/simulation" : "/ai";
    const r = http.post(base + path, null, {
      ...params,
      tags: { kind: "ai" },
      responseCallback: http.expectedStatuses(200, 429),
    });
    rejection.add(r.status === 429);
    unexpected.add(![200, 429].includes(r.status));
    if (r.status === 200) {
      ttft.add(r.timings.waiting);
      check(r, {
        "real manager emits complete synthetic stream": (r) =>
          r.body.includes('"complete"'),
      });
    }
    if (r.status === 429)
      check(r, {
        "admission includes retry-after": (r) =>
          Number(r.headers["Retry-After"]) > 0,
      });
  }
  sleep(0.25);
}
export function handleSummary(data) {
  const result = {
    mode: "ISOLATED: synthetic auth/data/AI; real admission SQL",
    vus: Number(__ENV.VUS || 10),
    ai: __ENV.AI !== "0",
    metrics: data.metrics,
  };
  return {
    [`docs/security/load-${__ENV.AI === "0" ? "reads" : "mixed"}-${__ENV.VUS || 10}.json`]:
      JSON.stringify(result, null, 2),
    stdout:
      JSON.stringify(
        {
          vus: result.vus,
          ai: result.ai,
          metrics: Object.fromEntries(
            Object.entries(data.metrics)
              .filter(([k]) =>
                [
                  "http_reqs",
                  "http_req_duration",
                  "unexpected_errors",
                  "controlled_429",
                  "synthetic_ttft_ms",
                  "checks",
                ].includes(k),
              )
              .map(([k, v]) => [k, v.values]),
          ),
        },
        null,
        2,
      ) + "\n",
  };
}
