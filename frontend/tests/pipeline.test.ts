import { describe, expect, it } from "vitest";
import type { AdviceResponse, PartialResponse, ReadyResponse } from "@/lib/contracts/advice";
import { runDemoPipeline } from "@/lib/server/pipeline/demo";
import { CancelledError, runLivePipeline } from "@/lib/server/pipeline/live";
import { LlmError } from "@/lib/server/providers/llm";
import { JevError } from "@/lib/server/providers/jev";
import { computeAnalogyFit } from "@/lib/server/ranking/scoring";
import type { WriterOutput } from "@/lib/server/synthesis/schema";
import { FakeJev, FakeLlm, HACKATHON, PROFILE, liveConfig, repo, request, writerDraft } from "./helpers";

const casesInPrompt = (prompt: string) => [...new Set([...prompt.matchAll(/"case_id": "(CASE_[A-Z0-9_]+)"/g)].map((m) => m[1]))];
const opts = { requestId: "req_test" };

/** A scorer that favours structural fit for Apollo 13 and Challenger. */
const goodScorer = (caseId: string, dim: string) => {
  const table: Record<string, number> = { CASE_APOLLO13_TRIAGE: 3, CASE_CHALLENGER_LAUNCH: 3, CASE_APOLLO11_ALARMS: 2 };
  return dim === "structural" ? table[caseId] : table[caseId] - 0.5;
};

const writerForPrompt = () => new FakeLlm({ writer: (_call, req) => writerDraft(casesInPrompt(req.prompt)) });

function referencedClaimsExist(r: ReadyResponse | PartialResponse) {
  const claimIds = new Set(r.claims.map((c) => c.claim_id));
  const passageIds = new Set(r.passages.map((p) => p.passage_id));
  for (const c of [...r.comparisons, ...(r.challenging ? [r.challenging] : [])]) {
    for (const p of c.historical_points) for (const id of p.claim_ids) expect(claimIds.has(id)).toBe(true);
    for (const id of c.case.context.claim_ids) expect(claimIds.has(id)).toBe(true);
    for (const q of c.quotes) expect(passageIds.has(q.passage_id)).toBe(true);
  }
  for (const claim of r.claims) for (const pid of claim.passage_ids) expect(passageIds.has(pid)).toBe(true);
}

describe("live pipeline (mocked providers)", () => {
  it("returns a validated ready answer with backend-owned Jev ratings", async () => {
    const jev = new FakeJev(goodScorer);
    const config = liveConfig();
    const r = (await runLivePipeline(request({ query: HACKATHON }), { repo: repo(), jev, llm: writerForPrompt(), config }, opts)) as ReadyResponse;

    expect(r.status).toBe("ready");
    expect(r.mode).toBe("live");
    expect(r.sample).toBe(false);
    expect(r.versions.jev_model).toBe("typesafe/jev-1.14");
    expect(r.versions.llm_model).toBe("google/gemini-3.8-flash");
    expect(r.versions.corpus).toBe("seed-v0.1.0");
    expect(r.comparisons.length).toBeGreaterThan(0);
    for (const c of r.comparisons) {
      expect(c.rating.source).toBe("jev");
      const levels = Object.fromEntries(c.rating.dimensions.map((d) => [d.dimension, d.raw_score])) as Record<"structural" | "incentives" | "constraints" | "time", number>;
      expect(c.rating.analogy_fit).toBe(computeAnalogyFit(levels, config.weights));
      expect(c.historical_points.every((p) => p.support === "supported")).toBe(true);
    }
    referencedClaimsExist(r);
    expect(r.sources.every((s) => s.url.startsWith("https://"))).toBe(true);
    expect(r.validation.claim_support).toBe("passed");
  });

  it("ranks on pre-decision information only: no outcomes reach the first Jev pass", async () => {
    const jev = new FakeJev(goodScorer);
    await runLivePipeline(request({ query: HACKATHON }), { repo: repo(), jev, llm: writerForPrompt(), config: liveConfig() }, opts);
    const firstState = JSON.stringify(jev.calls[0].state);
    for (const outcomeText of ["Samoa", "touched down", "flawed", "chosen_action", "outcome"]) expect(firstState).not.toContain(outcomeText);
    // Every ranking question names its target case explicitly.
    for (const [key, q] of Object.entries(jev.calls[0].questions)) {
      expect(JSON.stringify(q.instructions)).toContain(key.split("__")[0]);
    }
  });

  it("recomputes the profile and ranking when a material assumption changes", async () => {
    // Apollo 11 only fits when a tested way back exists.
    const scorer = (caseId: string, dim: string, state: unknown) => {
      const tested = JSON.stringify(state).includes("fallback path has been tested");
      if (caseId === "CASE_APOLLO11_ALARMS") return tested ? 4 : 1;
      return goodScorer(caseId, dim);
    };
    const before = new FakeJev(scorer);
    const after = new FakeJev(scorer);
    const deps = (jev: FakeJev) => ({ repo: repo(), jev, llm: writerForPrompt(), config: liveConfig() });

    const r1 = (await runLivePipeline(request({ query: HACKATHON, constraints: { rollback_tested: false } }), deps(before), opts)) as ReadyResponse;
    const r2 = (await runLivePipeline(request({ query: HACKATHON, constraints: { rollback_tested: true } }), deps(after), opts)) as ReadyResponse;

    expect(r1.profile?.known_facts.join(" ")).toContain("No tested rollback");
    expect(r2.profile?.known_facts.join(" ")).toContain("has been tested");
    expect(JSON.stringify(before.calls[0].state)).not.toEqual(JSON.stringify(after.calls[0].state));
    const ids = (r: ReadyResponse) => r.comparisons.map((c) => c.case.case_id);
    expect(ids(r1)).not.toContain("CASE_APOLLO11_ALARMS");
    expect(ids(r2)[0]).toBe("CASE_APOLLO11_ALARMS");
  });

  it("returns insufficient_evidence rather than forcing a weak match", async () => {
    const jev = new FakeJev(() => 0.6);
    const r = await runLivePipeline(request({ query: HACKATHON }), { repo: repo(), jev, llm: writerForPrompt(), config: liveConfig() }, opts);
    expect(r.status).toBe("insufficient_evidence");
    if (r.status !== "insufficient_evidence") return;
    expect(r.reason).toBe("no_relevant_case");
    expect(r.near_misses).toHaveLength(3);
    expect("recommendation" in r).toBe(false);
  });

  it("excludes a high-scoring case when Jev flags a critical mismatch", async () => {
    const jev = new FakeJev(() => 4, { mismatch: 0.9 });
    const r = await runLivePipeline(request({ query: HACKATHON }), { repo: repo(), jev, llm: writerForPrompt(), config: liveConfig() }, opts);
    expect(r.status).toBe("insufficient_evidence");
  });

  it("degrades to unrated cases without advice when Jev fails, never fabricating scores", async () => {
    const jev = new FakeJev(goodScorer, { fail: new JevError("http", "Jev returned HTTP 529", 529) });
    const llm = writerForPrompt();
    const r = (await runLivePipeline(request({ query: HACKATHON }), { repo: repo(), jev, llm, config: liveConfig() }, opts)) as PartialResponse;
    expect(r.status).toBe("partial");
    expect(r.ranking_status).toBe("unavailable");
    expect(r.recommendation).toBeNull();
    expect(r.comparisons).toHaveLength(0);
    expect(r.rated_cases).toHaveLength(0);
    expect(r.unranked_cases.length).toBeGreaterThan(0);
    expect(r.missing.map((m) => m.part)).toEqual(["ranking", "advice"]);
    expect(r.sample).toBe(false);
    expect(llm.writerCalls).toBe(0);
  });

  it("returns rated cases but no advice when the writer fails", async () => {
    const llm = new FakeLlm({ failWriter: new LlmError("timeout", "The model request timed out") });
    const r = (await runLivePipeline(request({ query: HACKATHON }), { repo: repo(), jev: new FakeJev(goodScorer), llm, config: liveConfig() }, opts)) as PartialResponse;
    expect(r.status).toBe("partial");
    expect(r.recommendation).toBeNull();
    expect(r.next_steps).toHaveLength(0);
    expect(r.rated_cases.length).toBeGreaterThan(0);
    expect(r.rated_cases.every((c) => c.rating.source === "jev")).toBe(true);
    expect(r.warnings.join(" ")).toContain("timed out");
  });

  it("still ranks with the user's own words when no LLM is configured", async () => {
    const r = (await runLivePipeline(request({ query: HACKATHON }), { repo: repo(), jev: new FakeJev(goodScorer), llm: null, config: liveConfig() }, opts)) as PartialResponse;
    expect(r.status).toBe("partial");
    expect(r.profile?.source).toBe("fallback");
    expect(r.rated_cases.length).toBeGreaterThan(0);
  });

  it("removes invalid evidence IDs and fabricated quotes, and the advice that depended on them", async () => {
    const bad = (ids: string[]): WriterOutput => {
      const d = writerDraft(ids);
      const a13 = d.comparisons.find((c) => c.case_id === "CASE_APOLLO13_TRIAGE")!;
      a13.historical_points = [{ text: "An invented detail.", claim_ids: ["CLM_FAKE_999"] }];
      a13.quotes = [{ passage_id: "PSG_A13_POWER", text: "The crew threw the manuals overboard to save weight." }];
      d.recommendation.basis_case_ids = ["CASE_APOLLO13_TRIAGE"];
      d.next_steps = [
        { text: "A step resting on Apollo 13.", basis_case_ids: ["CASE_APOLLO13_TRIAGE"] },
        { text: "A step resting on Challenger.", basis_case_ids: ["CASE_CHALLENGER_LAUNCH"] },
      ];
      return d;
    };
    const llm = new FakeLlm({ writer: (_c, req) => bad(casesInPrompt(req.prompt)) });
    const r = await runLivePipeline(request({ query: HACKATHON }), { repo: repo(), jev: new FakeJev(goodScorer), llm, config: liveConfig() }, opts);

    expect(llm.writerCalls).toBe(2); // one draft, one bounded repair
    expect(r.status).toBe("partial");
    if (r.status !== "partial") return;
    expect(r.recommendation).toBeNull();
    expect(r.comparisons.map((c) => c.case.case_id)).not.toContain("CASE_APOLLO13_TRIAGE");
    expect(r.next_steps.map((s) => s.text)).toEqual(["A step resting on Challenger."]);
    const reasons = r.validation!.removed.map((x) => x.reason);
    expect(reasons).toContain("No valid evidence ID");
    expect(reasons).toContain("Not an exact quotation");
    expect(r.validation!.repair_attempted).toBe(true);
    referencedClaimsExist(r);
  });

  it("accepts a successful repair", async () => {
    const llm = new FakeLlm({
      writer: (call, req) => {
        const d = writerDraft(casesInPrompt(req.prompt));
        if (call === 1) d.comparisons[0].historical_points[0].claim_ids = ["CLM_FAKE_001"];
        return d;
      },
    });
    const r = (await runLivePipeline(request({ query: HACKATHON }), { repo: repo(), jev: new FakeJev(goodScorer), llm, config: liveConfig() }, opts)) as ReadyResponse;
    expect(r.status).toBe("ready");
    expect(r.validation.evidence_ids).toBe("repaired");
  });

  it("drops historical points that Jev finds unsupported by their passages", async () => {
    const r = await runLivePipeline(
      request({ query: HACKATHON }),
      { repo: repo(), jev: new FakeJev(goodScorer, { support: "says_nothing" }), llm: writerForPrompt(), config: liveConfig() },
      opts,
    );
    expect(r.status).toBe("insufficient_evidence");
    if (r.status === "insufficient_evidence") expect(r.reason).toBe("evidence_removed");
  });

  it("prunes a single unsupported point without paying for a full repair", async () => {
    const llm = new FakeLlm({
      writer: (_c, req) => {
        const d = writerDraft(casesInPrompt(req.prompt));
        d.comparisons[0].historical_points.push({ text: "UNSUPPORTED-MARKER embellished detail.", claim_ids: d.comparisons[0].historical_points[0].claim_ids });
        return d;
      },
    });
    const jev = new FakeJev(goodScorer, { unsupportedMarker: "UNSUPPORTED-MARKER" });
    const r = (await runLivePipeline(request({ query: HACKATHON }), { repo: repo(), jev, llm, config: liveConfig() }, opts)) as ReadyResponse;
    expect(r.status).toBe("ready");
    expect(llm.writerCalls).toBe(1);
    expect(r.validation.repair_attempted).toBe(false);
    expect(r.validation.claim_support).toBe("items_removed");
    expect(r.validation.removed.map((x) => x.item).join(" ")).toContain("UNSUPPORTED-MARKER");
    expect(JSON.stringify(r.comparisons)).not.toContain("UNSUPPORTED-MARKER");
  });

  it("asks one targeted clarification, and proceeds once it is answered", async () => {
    const vague = { ...PROFILE, is_decision: false };
    const llm = new FakeLlm({ profile: vague, writer: (_c, req) => writerDraft(casesInPrompt(req.prompt)) });
    const deps = { repo: repo(), jev: new FakeJev(goodScorer), llm, config: liveConfig() };
    const first = await runLivePipeline(request({ query: "Things at work are complicated at the moment." }), deps, opts);
    expect(first.status).toBe("needs_clarification");
    const second = await runLivePipeline(
      request({ query: "Things at work are complicated at the moment.", clarifications: [{ question: "What is the choice?", answer: "Whether to rebuild the backend tonight." }] }),
      deps,
      opts,
    );
    expect(second.status).not.toBe("needs_clarification");
  });

  it("does not ask for clarification when the choice and its options are already clear", async () => {
    const eager = { ...PROFILE, clarification: { needed: true, questions: [{ question: "What are the exact terms?", why_it_matters: "Terms matter." }] } };
    const llm = new FakeLlm({ profile: eager, writer: (_c, req) => writerDraft(casesInPrompt(req.prompt)) });
    const r = await runLivePipeline(request({ query: HACKATHON }), { repo: repo(), jev: new FakeJev(goodScorer), llm, config: liveConfig() }, opts);
    expect(r.status).toBe("ready");
  });

  it("stops when the client cancels", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      runLivePipeline(request({ query: HACKATHON }), { repo: repo(), jev: new FakeJev(goodScorer), llm: writerForPrompt(), config: liveConfig() }, { ...opts, signal: ac.signal }),
    ).rejects.toBeInstanceOf(CancelledError);
  });
});

describe("demo pipeline", () => {
  const demoConfig = liveConfig({ APP_MODE: "demo" });
  const run = (input: Parameters<typeof request>[0]) => runDemoPipeline(request(input), repo(), demoConfig, opts);

  it("serves a labelled sample analysis for a preset, with every reference valid", async () => {
    const r = (await run({ query: HACKATHON })) as ReadyResponse;
    expect(r.status).toBe("ready");
    expect(r.sample).toBe(true);
    expect(r.mode).toBe("demo");
    expect(r.comparisons.every((c) => c.rating.source === "sample")).toBe(true);
    expect(r.validation.removed).toHaveLength(0);
    expect(r.validation.claim_support).toBe("skipped");
    expect(r.challenging?.case.case_id).toBe("CASE_APOLLO11_ALARMS");
    referencedClaimsExist(r);
  });

  it("serves a different prewritten variant when the rollback assumption changes", async () => {
    const base = (await run({ query: HACKATHON })) as ReadyResponse;
    const changed = (await run({ query: HACKATHON, constraints: { rollback_tested: true } })) as ReadyResponse;
    expect(changed.recommendation.text).not.toEqual(base.recommendation.text);
    expect(changed.comparisons[0].case.case_id).toBe("CASE_APOLLO11_ALARMS");
    expect(changed.challenging?.case.case_id).toBe("CASE_CHALLENGER_LAUNCH");
  });

  it("says plainly which entered context the preview does not model", async () => {
    const r = await run({ query: HACKATHON, constraints: { deadline_hours: 96 } });
    expect(r.warnings.join(" ")).toContain("does not model the deadline");
  });

  it("every prewritten sample passes the evidence checks", async () => {
    const { PRESETS } = await import("@/lib/demo/presets");
    for (const p of PRESETS) {
      for (const constraints of [{}, { rollback_tested: true }]) {
        const r = (await run({ query: p.query, constraints })) as ReadyResponse;
        expect(r.status).toBe("ready");
        expect(r.validation.removed).toEqual([]);
        expect(r.comparisons.reduce((n, c) => n + c.quotes.length, 0)).toBe(
          (await import("@/lib/server/demo/fixtures")).SAMPLE_VARIANTS.find((v) => v.preset_id === p.id && v.matches(constraints))!.draft.comparisons
            .filter((c) => c.case_id !== r.challenging?.case.case_id)
            .reduce((n, c) => n + c.quotes.length, 0),
        );
      }
    }
  });

  it("explains the preview limitation for arbitrary input instead of a canned answer", async () => {
    const r = (await run({ query: "Should I take a job abroad that pays more, or stay near my family? The offer expires Friday." })) as AdviceResponse;
    expect(r.status).toBe("partial");
    if (r.status !== "partial") return;
    expect(r.preview).toBe(true);
    expect(r.recommendation).toBeNull();
    expect(r.sample).toBe(false);
  });
});
