// Isolated test harness: production admission SQL + provider manager, SYNTHETIC auth/data/AI only.
import http from "node:http";
import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { isolatedPool, rpcAdapter } from "./db.mjs";
import { createAdmission } from "../../supabase/functions/dream-api/admission.mjs";
import { createGroqProviderManager } from "../../supabase/functions/dream-api/groq.mjs";
const pool = isolatedPool(),
  db = rpcAdapter(pool),
  secret = randomUUID();
const sign = (s) => createHmac("sha256", secret).update(s).digest("hex");
const identity = (auth) => {
  const [id, sig] = (auth ?? "").replace("Bearer ", "").split(".");
  if (
    !/^[a-f0-9-]{36}$/.test(id ?? "") ||
    !sig ||
    sig.length !== 64 ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(sign(id)))
  )
    return null;
  return id;
};
const provider = createGroqProviderManager({
  getEnv: (n) => (n === "GROQ_API_KEY_1" ? "synthetic-only" : undefined),
  logger: { log: () => {} },
  fetchImpl: async (_url, options) => {
    await delay(40, undefined, { signal: options.signal });
    return new Response(
      'data: {"choices":[{"delta":{"content":"Sintético"}}]}\n\ndata: [DONE]\n\n',
    );
  },
});
await pool.query(
  `create table if not exists public.load_conversations(id uuid primary key,owner_id uuid not null,title text not null,updated_at timestamptz not null default now());create index if not exists load_owner on public.load_conversations(owner_id,updated_at desc);create table if not exists public.load_exams(id uuid primary key,owner_id uuid not null,title text not null);create index if not exists load_exam_owner on public.load_exams(owner_id);`,
);
if (
  Number(
    (await pool.query("select count(*) from public.load_conversations")).rows[0]
      .count,
  ) === 0
) {
  await pool.query(
    `insert into public.load_conversations select gen_random_uuid(),('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Synthetic conversation' from generate_series(1,10000)i cross join generate_series(1,5)n;insert into public.load_exams select gen_random_uuid(),('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Synthetic exam' from generate_series(1,10000)i;analyze public.load_conversations;analyze public.load_exams;`,
  );
}
await pool.query(
  "truncate dream_private.counters,dream_private.leases,dream_private.provider_state",
);
// TEST ONLY: deliberately high daily budgets so load measures concurrency, not daily exhaustion.
await pool.query(
  "update dream_private.limits set enabled=true,rpm=1000,daily=10000,exams_daily=1000,user_tokens=100000000,global_tokens=10000000000,user_microusd=100000000,global_microusd=10000000000,token_microusd=1,search_microusd=1000,global_concurrency=8",
);
const server = http.createServer(async (req, res) => {
  const respond = (status, data, extra = {}) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extra,
    });
    res.end(JSON.stringify(data));
  };
  let admission,
    admitted = false;
  try {
    if (req.url === "/health") return respond(200, { isolated: true });
    if (req.url === "/test/login") {
      const n = Number(req.headers["x-test-user"]);
      if (!Number.isInteger(n) || n < 1 || n > 10000) return respond(400, {});
      const id = "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
      return respond(200, { token: id + "." + sign(id) });
    }
    const owner = identity(req.headers.authorization);
    if (!owner) return respond(401, {});
    if (req.url === "/conversations")
      return respond(200, {
        items: (
          await pool.query(
            "select id,title,updated_at from public.load_conversations where owner_id=$1 order by updated_at desc limit 20",
            [owner],
          )
        ).rows,
      });
    if (req.url === "/exams" || req.url === "/plan")
      return respond(200, {
        exams: (
          await pool.query(
            "select id,title from public.load_exams where owner_id=$1 limit 20",
            [owner],
          )
        ).rows,
      });
    if (req.url === "/conversation-create")
      return respond(200, {
        conversation: (
          await pool.query(
            "insert into public.load_conversations values(gen_random_uuid(),$1,'Synthetic created',now()) returning id",
            [owner],
          )
        ).rows[0],
      });
    if (req.url !== "/ai" && req.url !== "/simulation") return respond(404, {});
    admission = createAdmission(
      db,
      owner,
      req.headers["x-dream-request-id"] ?? randomUUID(),
    );
    await admission.admit(req.url === "/ai" ? "chat" : "exam_session_create");
    admitted = true;
    await admission.beforeAttempt("groq", {
      messages: [{ content: "synthetic" }],
      max_tokens: 256,
    });
    res.writeHead(200, {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
    });
    const abort = new AbortController();
    res.on("close", () => abort.abort());
    for await (const chunk of provider.stream({
      body: {},
      signal: abort.signal,
    }))
      res.write(
        JSON.stringify({
          type: "delta",
          text: chunk.choices[0].delta.content,
        }) + "\n",
      );
    res.end('{"type":"complete"}\n');
  } catch (e) {
    if (!res.headersSent)
      respond(
        e.status || 503,
        { error: e.code || "isolated_failure" },
        { "Retry-After": String(e.retryAfter || 5) },
      );
    else res.end('{"type":"error","message":"synthetic interruption"}\n');
  } finally {
    if (admitted) await admission.release().catch(() => {});
  }
});
server.listen(3400, "127.0.0.1", () =>
  console.log(
    "ISOLATED harness 127.0.0.1:3400, 50k synthetic conversations, real PostgreSQL admission, synthetic AI latency 40ms",
  ),
);
process.on("SIGTERM", () =>
  server.close(async () => {
    await pool.end();
    process.exit(0);
  }),
);
