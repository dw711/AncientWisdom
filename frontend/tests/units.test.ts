import { describe, expect, it, vi } from "vitest";
import { parseWeights, DEFAULT_WEIGHTS } from "@/lib/server/config";
import { hashPassage } from "@/lib/server/corpus/json-repository";
import { redact } from "@/lib/server/privacy";
import { HttpJevClient, JevError } from "@/lib/server/providers/jev";
import { LlmError, OpenRouterLlmClient } from "@/lib/server/providers/llm";
import { ProfileDraftSchema } from "@/lib/server/synthesis/schema";
import { RUBRIC } from "@/lib/server/ranking/rubric";
import { buildRating, computeAnalogyFit, sampleDimension } from "@/lib/server/ranking/scoring";
import { checkDraft, findExactQuote } from "@/lib/server/validation/checks";
import { PROFILE, liveConfig, repo, writerDraft } from "./helpers";

const thresholds = { minAnalogyFit: 45, criticalMismatch: 0.6, structuralFloor: 0.4, lowConfidence: 0.35 };

describe("analogy fit", () => {
  it("implements round(100 × Σ w × score/4) with the default weights", () => {
    expect(computeAnalogyFit({ structural: 4, incentives: 4, constraints: 4, time: 4 }, DEFAULT_WEIGHTS)).toBe(100);
    expect(computeAnalogyFit({ structural: 3, incentives: 2, constraints: 3, time: 2 }, DEFAULT_WEIGHTS)).toBe(66);
    expect(computeAnalogyFit({ structural: 0, incentives: 0, constraints: 0, time: 0 }, DEFAULT_WEIGHTS)).toBe(0);
  });

  it("parses configurable weights and renormalises them", () => {
    const w = parseWeights("structural=2,incentives=1,constraints=1,time=0");
    expect(w.structural).toBeCloseTo(0.5);
    expect(w.time).toBe(0);
    expect(parseWeights("nonsense")).toEqual(DEFAULT_WEIGHTS);
  });

  it("applies eligibility gates independently of the weighted score", () => {
    const dims = (level: number) => RUBRIC.map((r) => sampleDimension(r.dimension, level));
    const strong = { dimensions: dims(4), weights: DEFAULT_WEIGHTS, thresholds, source: "jev" as const };
    expect(buildRating({ ...strong, criticalMismatch: 0.1, evidenceOk: true }).eligible).toBe(true);
    expect(buildRating({ ...strong, criticalMismatch: 0.9, evidenceOk: true }).eligible).toBe(false);
    expect(buildRating({ ...strong, criticalMismatch: null, evidenceOk: false }).eligible).toBe(false);
    const weakStructure = [sampleDimension("structural", 1), ...RUBRIC.slice(1).map((r) => sampleDimension(r.dimension, 4))];
    const r = buildRating({ dimensions: weakStructure, weights: DEFAULT_WEIGHTS, criticalMismatch: 0, evidenceOk: true, thresholds, source: "jev" });
    expect(r.analogy_fit).toBeGreaterThanOrEqual(45);
    expect(r.eligible).toBe(false);
  });
});

describe("corpus", () => {
  it("loads, passes integrity checks and stores verbatim-hashed passages", async () => {
    const r = repo();
    expect(await r.corpusVersion()).toBe("seed-v0.1.0");
    const bundles = await r.getBundles(["CASE_APOLLO13_TRIAGE", "CASE_APOLLO11_ALARMS", "CASE_CHALLENGER_LAUNCH", "CASE_UNKNOWN"]);
    expect(bundles).toHaveLength(3);
    for (const b of bundles) {
      for (const p of b.passages) expect(hashPassage(p.text)).toBe(p.content_hash);
      expect(b.claims.some((c) => c.phase === "pre_decision")).toBe(true);
      expect(b.claims.some((c) => c.phase === "outcome")).toBe(true);
    }
  });

  it("keeps candidate views free of outcomes", async () => {
    const text = JSON.stringify(await repo().listCandidates());
    expect(text).not.toContain("chosen_action");
    expect(text).not.toContain("Samoa");
  });
});

describe("deterministic validation", () => {
  const ctx = async () => ({ bundles: new Map((await repo().getBundles(["CASE_APOLLO13_TRIAGE", "CASE_CHALLENGER_LAUNCH"])).map((b) => [b.record.case_id, b])) });

  it("accepts a clean draft", async () => {
    expect(checkDraft(writerDraft(["CASE_APOLLO13_TRIAGE", "CASE_CHALLENGER_LAUNCH"]), await ctx())).toEqual([]);
  });

  it("rejects unknown cases, claims from another case, inexact quotes, URLs and contradictions", async () => {
    const d = writerDraft(["CASE_APOLLO13_TRIAGE", "CASE_CHALLENGER_LAUNCH"]);
    d.comparisons[0].historical_points[0].claim_ids = ["CLM_CH_008"];
    d.comparisons[0].quotes = [{ passage_id: "PSG_A13_POWER", text: "Power was never a concern at all." }];
    d.comparisons[1].shared_mechanism = "See https://example.com for more.";
    d.comparisons.push({ ...d.comparisons[0], case_id: "CASE_INVENTED" });
    d.conditional_alternatives = [
      { condition: "If a rollback exists", action: "Experiment", basis_case_ids: [] },
      { condition: "if a rollback exists", action: "Do not experiment", basis_case_ids: [] },
    ];
    const codes = checkDraft(d, await ctx()).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["claim_not_in_case", "quote_not_exact", "url_in_text", "unknown_case", "contradiction"]));
  });

  it("flags quotations too short to be meaningful", async () => {
    const d = writerDraft(["CASE_APOLLO13_TRIAGE", "CASE_CHALLENGER_LAUNCH"]);
    d.comparisons[0].quotes = [{ passage_id: "PSG_A13_LIFEBOAT", text: "LM lifeboat" }];
    expect(checkDraft(d, await ctx()).map((i) => i.code)).toContain("quote_too_short");
  });

  it("matches quotations exactly, tolerating only typographic quote marks", () => {
    const passage = "Lovell said, “It’s a gas of some sort.” It was oxygen gas.";
    expect(findExactQuote(passage, `"It's a gas of some sort."`)).toBe("It’s a gas of some sort.");
    expect(findExactQuote(passage, "It is a gas of some sort.")).toBeNull();
  });

  it("redacts contact details but keeps dates and ordinary numbers", () => {
    const out = redact("Email me at jo@example.com or call +44 7700 900123 before 2026-10-25; we have 24 hours.");
    expect(out).toContain("[email]");
    expect(out).toContain("[number]");
    expect(out).toContain("2026-10-25");
    expect(out).toContain("24 hours");
  });
});

describe("Jev HTTP adapter", () => {
  const documented = {
    id: "gen-123",
    provider: "TypeSafe",
    model: "typesafe/jev-1.14",
    answers: {
      urgency: { type: "score", score: 1.7, confidence: 0.55, legend: { "0": "a", "1": "b", "2": "c" }, probabilities: { "0": 0.1, "1": 0.1, "2": 0.8 } },
      billing: { type: "noul", noul: 0.98 },
    },
    usage: { input_tokens: 120, output_tokens: 12, cost: 0.000005 },
  };
  const ok = () => new Response(JSON.stringify(documented), { status: 200, headers: { "content-type": "application/json" } });
  const ask = (client: HttpJevClient) =>
    client.ask({ text: "x" }, { billing: { type: "noul", instructions: "Is this about billing?" } }, { signal: new AbortController().signal, deadlineMs: 20_000 });

  it("sends the documented request shape and parses typed answers", async () => {
    const fetchMock = vi.fn(async () => ok());
    const client = new HttpJevClient("key", "typesafe/jev-1.14", "https://openrouter.ai/api/v1/systemone", 5000, fetchMock as unknown as typeof fetch);
    const res = await ask(client);
    expect(res.answers.billing).toEqual({ type: "noul", noul: 0.98 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/systemone");
    expect(client.totals.cost_usd).toBeCloseTo(0.000005);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer key");
    expect(Object.keys(JSON.parse(String(init.body)))).toEqual(["model", "state", "questions"]);
  });

  it("retries once on 529 and then succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 529 })).mockResolvedValueOnce(ok());
    const client = new HttpJevClient("key", "typesafe/jev-1.14", "https://x", 5000, fetchMock as unknown as typeof fetch);
    await expect(ask(client)).resolves.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry authentication errors", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ detail: "bad key" }), { status: 401 }));
    const client = new HttpJevClient("key", "typesafe/jev-1.14", "https://x", 5000, fetchMock as unknown as typeof fetch);
    await expect(ask(client)).rejects.toBeInstanceOf(JevError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects responses that do not match the documented shape", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), { status: 200 }));
    const client = new HttpJevClient("key", "typesafe/jev-1.14", "https://x", 5000, fetchMock as unknown as typeof fetch);
    await expect(ask(client)).rejects.toMatchObject({ kind: "invalid_response" });
  });
});

describe("OpenRouter configuration", () => {
  it("bills both providers through one OpenRouter key with pinned models", () => {
    const c = liveConfig();
    expect(c.jev.apiKey).toBe("test");
    expect(c.llm.apiKey).toBe("test");
    expect(c.jev.url).toBe("https://openrouter.ai/api/v1/systemone");
    expect(c.jev.model).toBe("typesafe/jev-1.14");
    expect(c.llm.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(c.llm.model).toBe("google/gemini-3.8-flash");
  });
});

describe("OpenRouter LLM adapter", () => {
  const completion = (content: string, finish = "stop") =>
    new Response(
      JSON.stringify({
        id: "gen-1",
        object: "chat.completion",
        created: 1,
        model: "google/gemini-3.8-flash",
        system_fingerprint: null,
        choices: [{ index: 0, finish_reason: finish, message: { role: "assistant", content } }],
        usage: { prompt_tokens: 900, completion_tokens: 300, total_tokens: 1200, cost: 0.0096 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  const req = { system: "s", prompt: "p", schema: ProfileDraftSchema, schemaName: "decision_profile", effort: "low" as const, maxTokens: 8000, signal: new AbortController().signal, timeoutMs: 20_000 };
  const client = (fetchMock: unknown) => new OpenRouterLlmClient("or-key", "google/gemini-3.8-flash", "https://openrouter.ai/api/v1/chat/completions", fetchMock as typeof fetch);

  it("sends a strict JSON-schema request and validates the answer", async () => {
    const fetchMock = vi.fn(async () => completion(JSON.stringify(PROFILE)));
    const c = client(fetchMock);
    const res = await c.generate(req);
    expect(res.data.decision).toBe(PROFILE.decision);
    expect(res.usage.cost_usd).toBeCloseTo(0.0096);
    expect(c.totals.cost_usd).toBeCloseTo(0.0096);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer or-key");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("google/gemini-3.8-flash");
    expect(body.reasoning).toEqual({ effort: "low", exclude: true });
    expect(body.provider).toEqual({ require_parameters: true });
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    const schema = body.response_format.json_schema.schema;
    expect(schema.$schema).toBeUndefined();
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(Object.keys(schema.properties));
  });

  it("reports insufficient credits without retrying", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { code: 402, message: "Insufficient credits" } }), { status: 402 }));
    await expect(client(fetchMock).generate(req)).rejects.toMatchObject({ kind: "credits" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on 429 and then succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 429 })).mockResolvedValueOnce(completion(JSON.stringify(PROFILE)));
    await expect(client(fetchMock).generate(req)).resolves.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats truncation, refusals and schema mismatches as errors, never as answers", async () => {
    await expect(client(vi.fn(async () => completion("{\"decision\":", "length"))).generate(req)).rejects.toMatchObject({ kind: "truncated" });
    await expect(client(vi.fn(async () => completion("", "content_filter"))).generate(req)).rejects.toMatchObject({ kind: "refusal" });
    await expect(client(vi.fn(async () => completion(JSON.stringify({ decision: "x" })))).generate(req)).rejects.toBeInstanceOf(LlmError);
  });
});

describe("timeouts", () => {
  it("abortAfter fires even after garbage collection and passes parent aborts through", async () => {
    const { abortAfter } = await import("@/lib/server/pipeline/runtime");
    const t0 = Date.now();
    const timed = abortAfter(150);
    (globalThis as { gc?: () => void }).gc?.();
    await new Promise<void>((resolve) => timed.signal.addEventListener("abort", () => resolve(), { once: true }));
    expect(Date.now() - t0).toBeGreaterThanOrEqual(140);
    expect((timed.signal.reason as Error).name).toBe("TimeoutError");

    const parent = new AbortController();
    const child = abortAfter(60_000, parent.signal);
    parent.abort(new Error("client went away"));
    expect(child.signal.aborted).toBe(true);
    child.dispose();
  });

  it("reports a model that stalls while sending its body as a timeout", async () => {
    const stalled = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(" "));
          init?.signal?.addEventListener("abort", () => controller.error(init.signal!.reason), { once: true });
        },
      });
      return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
    });
    const c = new OpenRouterLlmClient("k", "m", "https://x", stalled as unknown as typeof fetch);
    const req = { system: "s", prompt: "p", schema: ProfileDraftSchema, schemaName: "p", effort: "low" as const, maxTokens: 10, signal: new AbortController().signal, timeoutMs: 3200 };
    await expect(c.generate(req)).rejects.toMatchObject({ kind: "timeout" });
  });
});
