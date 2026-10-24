import { describe, expect, it } from "vitest";
import type { PartialResponse } from "@/lib/contracts/advice";
import { mapToEvidence } from "@/lib/server/evidence-service";
import { renderEvidence } from "@/lib/server/mcp/render";
import { runLivePipeline } from "@/lib/server/pipeline/live";
import { FakeJev, FakeLlm, HACKATHON, liveConfig, repo, request, writerDraft } from "./helpers";

const opts = { requestId: "req_test" };

/** A scorer that favours structural fit for Apollo 13 and Challenger. */
const goodScorer = (caseId: string, dim: string) => {
  const table: Record<string, number> = { CASE_APOLLO13_TRIAGE: 3, CASE_CHALLENGER_LAUNCH: 3, CASE_APOLLO11_ALARMS: 2 };
  return dim === "structural" ? table[caseId] : table[caseId] - 0.5;
};

const writerForPrompt = () => {
  const casesInPrompt = (prompt: string) => [...new Set([...prompt.matchAll(/"case_id": "(CASE_[A-Z0-9_]+)"/g)].map((m) => m[1]))];
  return new FakeLlm({ writer: (_call, req: { prompt: string }) => writerDraft(casesInPrompt(req.prompt)) });
};

/** Every field that must never appear in the outcome-free evidence view. */
const POST_DECISION_KEYS = [
  "chosen_action",
  "outcome",
  "lesson",
  "claims",
  "passages",
  "context",
  "disputes",
  "pattern",
] as const;

describe("evidence mapping", () => {
  it("strips every post-decision field from the rated partial", async () => {
    const llm = writerForPrompt();
    const partial = (await runLivePipeline(
      request({ query: HACKATHON }),
      { repo: repo(), jev: new FakeJev(goodScorer), llm, config: liveConfig() },
      { ...opts, skipSynthesis: true },
    )) as PartialResponse;
    expect(partial.rated_cases.length).toBeGreaterThan(0);

    const evidence = await mapToEvidence(partial, repo());
    expect(evidence.kind).toBe("evidence");
    expect(evidence.status).toBe("ready");
    expect(evidence.rated_cases).toHaveLength(partial.rated_cases.length);
    for (const rc of evidence.rated_cases) {
      const serialised = JSON.stringify(rc);
      for (const key of POST_DECISION_KEYS) {
        expect(serialised).not.toContain(`"${key}"`);
      }
      expect(rc.pre_decision.options.length).toBeGreaterThanOrEqual(2);
      expect(rc.pre_decision.situation.length).toBeGreaterThan(0);
      expect(rc.rating.analogy_fit).toBeGreaterThan(0);
      expect(["supporting", "challenging"]).toContain(rc.role);
    }
  });

  it("keeps the rated ids and their pre-decision content aligned with the corpus", async () => {
    const llm = writerForPrompt();
    const partial = (await runLivePipeline(
      request({ query: HACKATHON }),
      { repo: repo(), jev: new FakeJev(goodScorer), llm, config: liveConfig() },
      { ...opts, skipSynthesis: true },
    )) as PartialResponse;
    const evidence = await mapToEvidence(partial, repo());
    const bundle = (await repo().getBundles([evidence.rated_cases[0].case_id]))[0];
    expect(evidence.rated_cases[0].pre_decision).toEqual(bundle.record.pre_decision);
  });

  it("renders the evidence view without revealing anything post-decision", async () => {
    const llm = writerForPrompt();
    const partial = (await runLivePipeline(
      request({ query: HACKATHON }),
      { repo: repo(), jev: new FakeJev(goodScorer), llm, config: liveConfig() },
      { ...opts, skipSynthesis: true },
    )) as PartialResponse;
    const evidence = await mapToEvidence(partial, repo());
    const markdown = renderEvidence(evidence);

    expect(markdown).toContain("## Rated historical cases — outcomes withheld");
    expect(markdown).toContain("Analogy fit:");
    expect(markdown).toContain("**Options on the table:**");
    expect(markdown).toContain("get_historical_case");
    for (const rc of evidence.rated_cases) {
      expect(markdown).toContain(rc.title);
    }
    // The chosen actions and outcomes of the rated cases must not appear.
    for (const bundle of await repo().getBundles(evidence.rated_cases.map((rc) => rc.case_id))) {
      expect(markdown).not.toContain(bundle.record.chosen_action.text.slice(0, 40));
      expect(markdown).not.toContain(bundle.record.outcome.text.slice(0, 40));
    }
  });
});
