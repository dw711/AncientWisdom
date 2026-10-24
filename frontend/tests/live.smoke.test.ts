import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DecisionProfile } from "@/lib/contracts/advice";
import { loadConfig } from "@/lib/server/config";
import { createJevClient } from "@/lib/server/providers/jev";
import { createLlmClient } from "@/lib/server/providers/llm";
import { runLivePipeline } from "@/lib/server/pipeline/live";
import { AdviceRequestSchema } from "@/lib/contracts/advice";
import { PostgresCaseRepository } from "@/lib/server/corpus/postgres-repository";
import { rankCandidates } from "@/lib/server/ranking/rank";
import { createDeadline } from "@/lib/server/pipeline/runtime";
import { HACKATHON, repo } from "./helpers";

/**
 * Real calls to OpenRouter (costs a fraction of a cent). Runs only with
 * LIVE_SMOKE=1 and a key in .env.local:  LIVE_SMOKE=1 npx vitest run tests/live.smoke.test.ts
 */
// Next's own loader skips .env.local when NODE_ENV=test, so read it directly.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const enabled = process.env.LIVE_SMOKE === "1" && Boolean(process.env.OPENROUTER_API_KEY);

const PROFILE: DecisionProfile = {
  decision: "Whether to agree to the teammate's proposal to rebuild the partly working backend in a new framework tonight, with one day left before the hackathon demo.",
  options: [
    "Agree to the full rebuild in the new framework tonight",
    "Decline the rebuild and focus on finishing and stabilising the existing backend",
    "Keep the working backend as the demo version while the teammate trials the new framework on a separate branch with a firm cut-off time",
  ],
  actors: ["You", "Your teammate"],
  known_constraints: ["Only one day remains before the demo", "The existing backend only partly works"],
  urgency: "immediate",
  time_horizon: "About 24 hours",
  reversibility: "partly_reversible",
  relationship: "repeated",
  stakes: "medium",
  known_facts: ["The teammate wants the new framework because it would be cleaner"],
  user_interpretations: [],
  uncertainties: ["Whether a tested rollback exists"],
  assumptions: [],
  explicit_constraints: {},
  source: "llm",
};

const CONTROL_QUERY =
  "We are choosing a wedding venue. The barn and the hotel are both available on our date, both fit our budget and both can seat all our guests. My partner slightly prefers the barn's look and I slightly prefer the hotel's food. Which should we book?";
const CONTROL: DecisionProfile = {
  ...PROFILE,
  decision: "Which of two equally suitable, affordable wedding venues to book.",
  options: ["Book the barn", "Book the hotel"],
  actors: ["You", "Your partner"],
  known_constraints: ["Both venues are available and within budget"],
  urgency: "weeks",
  time_horizon: "Booking in the next few weeks",
  reversibility: "partly_reversible",
  stakes: "low",
  known_facts: ["Both venues seat all the guests"],
  uncertainties: [],
};

async function rank(profile: DecisionProfile, query: string) {
  const config = loadConfig();
  const jev = createJevClient(config.jev)!;
  const result = await rankCandidates({
    profile,
    query,
    candidates: await repo().listCandidates(),
    jev,
    weights: config.weights,
    thresholds: config.thresholds,
    batchSize: config.jev.batchSize,
    concurrency: config.jev.concurrency,
    deadline: createDeadline(60_000),
  });
  for (const r of result.ranked) {
    console.log(
      r.candidate.case_id.padEnd(24),
      "fit",
      r.rating.analogy_fit,
      "mismatch",
      r.rating.critical_mismatch_probability?.toFixed(2),
      r.rating.dimensions.map((d) => `${d.dimension}=${d.raw_score}(c${d.confidence?.toFixed(2)})`).join(" "),
      r.rating.eligible ? "ELIGIBLE" : r.rating.ineligible_reasons.join(" "),
    );
  }
  console.log("jev model", result.jevModel, "cost", jev.totals);
  return result;
}

describe.runIf(enabled)("live OpenRouter smoke test", () => {
  it("ranks the seed cases with Jev and discriminates a related dilemma from an unrelated control", async () => {
    console.log("--- hackathon rebuild");
    const related = await rank(PROFILE, HACKATHON);
    console.log("--- control: wedding venue");
    const control = await rank(CONTROL, CONTROL_QUERY);
    expect(related.ranked).toHaveLength(3);
    expect(related.jevModel).toMatch(/jev/);
    const mean = (r: typeof related) => r.ranked.reduce((n, x) => n + x.rating.analogy_fit, 0) / r.ranked.length;
    expect(mean(related)).toBeGreaterThan(mean(control));
    expect(control.ranked.every((r) => !r.rating.eligible)).toBe(true);
    expect(related.ranked.some((r) => r.rating.eligible)).toBe(true);
  }, 90_000);
});

/**
 * Full pipeline against OpenRouter (costs roughly $0.1–0.3). Opt in separately:
 *   LIVE_SMOKE_FULL=1 npx vitest run tests/live.smoke.test.ts
 */
describe.runIf(process.env.LIVE_SMOKE_FULL === "1" && Boolean(process.env.OPENROUTER_API_KEY))("live full pipeline", () => {
  it("produces a validated answer and reports stage timings and cost", async () => {
    const config = loadConfig({ ...process.env, APP_MODE: "live" } as NodeJS.ProcessEnv);
    const jev = createJevClient(config.jev)!;
    const llm = createLlmClient(config.llm)!;
    // Uses the team's PostgreSQL corpus when DATABASE_URL is set, otherwise the JSON seed.
    const corpus = config.databaseUrl ? new PostgresCaseRepository(config.databaseUrl, { pinnedVersion: config.corpusVersionPin, cacheMs: 60_000 }) : repo();
    const query = process.env.SMOKE_QUERY ?? HACKATHON;
    const r = await runLivePipeline(AdviceRequestSchema.parse({ query }), { repo: corpus, jev, llm, config }, { requestId: "req_smoke", onProgress: (s, m) => console.log("progress", s, m) });
    console.log("corpus", corpus.kind, r.versions.corpus);
    console.log("status", r.status, "timings", r.timings_ms, "warnings", r.warnings);
    console.log("cost", { jev: jev.totals, llm: llm.totals });
    if (r.status === "ready" || r.status === "partial") {
      console.log("recommendation", r.recommendation?.text);
      console.log("comparisons", r.comparisons.map((c) => [c.case.case_id, c.rating.analogy_fit, c.historical_points.map((p) => p.support)]));
      console.log("challenging", r.challenging?.case.case_id ?? r.challenging_note);
      console.log("validation", JSON.stringify(r.validation));
      for (const c of [...r.comparisons, ...(r.challenging ? [r.challenging] : [])]) {
        console.log("CARD", c.role, c.case.case_id, c.rating.analogy_fit, "|", c.shared_mechanism);
        for (const p of c.historical_points) console.log("  POINT", p.support, p.support_confidence, p.claim_ids.join(","), "|", p.text);
        for (const q of c.quotes) console.log("  QUOTE", q.passage_id, "|", q.text);
      }
      console.log("NEXT", JSON.stringify(r.next_steps.map((s) => s.text)));
      console.log("CHANGE", JSON.stringify(r.what_would_change));
    }
    expect(r.status).toBe("ready");
  }, 300_000);
});
