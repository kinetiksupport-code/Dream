import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  limitKind,
  limitMessage,
  searchCanBeSkipped,
  waitText,
} from "../supabase/functions/dream-api/limit-messages.mjs";
import { GroqProviderError } from "../supabase/functions/dream-api/groq.mjs";
import { CloudflareProviderError } from "../supabase/functions/dream-api/cloudflare.mjs";
import { AdmissionError } from "../supabase/functions/dream-api/admission.mjs";
import { TavilyError } from "../supabase/functions/dream-api/tavily.mjs";

test("(a) the AI is busy: says so and how many seconds to wait", () => {
  const groq = new GroqProviderError("provider_rate_limit", { status: 429, retryAfter: 20 });
  assert.equal(limitKind(groq), "saturated");
  assert.equal(limitMessage(groq), "La IA está saturada ahora mismo. Inténtalo de nuevo en 20 segundos.");
  const cooling = new GroqProviderError("all_keys_cooling_down", { status: 503, retryAfter: 90 });
  assert.match(limitMessage(cooling) ?? "", /saturada.*2 minutos/);
  const paused = new AdmissionError("provider_rate_limit", 429, 5);
  assert.match(limitMessage(paused) ?? "", /saturada.*5 segundos/);
  const cf = new CloudflareProviderError("provider_rate_limit", { status: 429, retryAfter: 1 });
  assert.match(limitMessage(cf) ?? "", /1 segundo\.$/);
});

test("(b) web search unavailable is its own message", () => {
  const tavily = new TavilyError("provider_rate_limit", 429, 30);
  assert.equal(limitKind(tavily), "search");
  assert.match(limitMessage(tavily) ?? "", /búsqueda web no está disponible/);
});

test("(c) the student's own Dream limit is its own message", () => {
  assert.match(limitMessage(new AdmissionError("dream_rpm", 429, 40)) ?? "", /tu límite de uso de Dream.*40 segundos/);
  assert.match(limitMessage(new AdmissionError("dream_daily", 429, 3600)) ?? "", /tu límite de uso de Dream de hoy/);
  assert.match(limitMessage(new AdmissionError("dream_mode_limit", 429, 60)) ?? "", /ventana de uso de 5 horas/);
  assert.equal(limitKind(new AdmissionError("dream_concurrency", 429, 5)), "saturated");
  assert.equal(limitMessage(new AdmissionError("context_budget", 413, 0)), null);
});

test("the three messages are different", () => {
  const texts = new Set([
    limitMessage(new GroqProviderError("provider_rate_limit", { status: 429, retryAfter: 10 })),
    limitMessage(new TavilyError("provider_rate_limit", 429, 10)),
    limitMessage(new AdmissionError("dream_rpm", 429, 10)),
  ]);
  assert.equal(texts.size, 3);
});

test("only the search failing never stops the answer; a Dream limit or a cancel does", () => {
  assert.equal(searchCanBeSkipped(new TavilyError("provider_rate_limit", 429, 10)), true);
  assert.equal(searchCanBeSkipped(new TavilyError("web_search_timeout", 503)), true);
  assert.equal(searchCanBeSkipped(new Error("network")), true);
  assert.equal(searchCanBeSkipped(new AdmissionError("provider_rate_limit", 429, 10)), true);
  assert.equal(searchCanBeSkipped(new TavilyError("aborted", 503)), false);
  assert.equal(searchCanBeSkipped(new AdmissionError("dream_budget", 429, 10)), false);
});

test("waitText reads naturally", () => {
  assert.equal(waitText(0), "1 segundo");
  assert.equal(waitText(45), "45 segundos");
  assert.equal(waitText(60), "1 minuto");
  assert.equal(waitText(61), "2 minutos");
});

test("chat uses these messages and answers without searching when search fails", () => {
  const source = readFileSync("supabase/functions/dream-api/index.ts", "utf8");
  assert.ok(!source.includes("Se ha alcanzado un límite de solicitudes"));
  assert.ok(!source.includes("La búsqueda web no está configurada"));
  assert.match(source, /searchCanBeSkipped\(error\)/);
  assert.match(source, /limitMessage\(error\)/);
});
