import { AdviceRequestSchema, type AdviceRequestInput } from "@/lib/contracts/advice";
import { loadConfig } from "@/lib/server/config";
import { JsonCaseRepository } from "@/lib/server/corpus/json-repository";
import type { LlmClient, LlmRequest } from "@/lib/server/providers/llm";
import type { JevClient, JevQuestion, SystemOneResponse } from "@/lib/server/providers/jev";
import { ProfileDraftSchema, WriterOutputSchema, type ProfileDraft, type WriterOutput } from "@/lib/server/synthesis/schema";

export const repo = () => new JsonCaseRepository("seed-v0.1.0");

export const liveConfig = (env: Record<string, string> = {}) =>
  loadConfig({ APP_MODE: "live", OPENROUTER_API_KEY: "test", PIPELINE_DEADLINE_MS: "180000", ...env } as unknown as NodeJS.ProcessEnv);

export const request = (input: AdviceRequestInput) => AdviceRequestSchema.parse(input);

export const HACKATHON =
  "We have one day left at a hackathon. Our backend partly works, but my teammate wants to replace it with a new framework tonight because it would be cleaner. I worry we will end up with nothing working for the demo. Should we agree to the rebuild?";

type Scorer = (caseId: string, dimension: string, state: unknown) => number;

/**
 * A fake Jev that answers documented question types. Score levels come from
 * `scorer`, so tests can make ranking depend on the state that was sent.
 */
export class FakeJev implements JevClient {
  readonly model = "typesafe/jev-1.14";
  calls: { state: unknown; questions: Record<string, JevQuestion> }[] = [];
  constructor(
    private readonly scorer: Scorer,
    private readonly opts: { mismatch?: number; challenge?: Record<string, number>; support?: "supports" | "says_nothing"; unsupportedMarker?: string; contradiction?: number; fail?: Error } = {},
  ) {}

  async ask(state: unknown, questions: Record<string, JevQuestion>): Promise<SystemOneResponse> {
    this.calls.push({ state, questions });
    if (this.opts.fail) throw this.opts.fail;
    const answers: SystemOneResponse["answers"] = {};
    for (const [key, q] of Object.entries(questions)) {
      const [caseId, kind] = key.split("__");
      if (q.type === "score") {
        const level = this.scorer(caseId, kind, state);
        answers[key] = {
          type: "score",
          score: level,
          confidence: 0.8,
          legend: Object.fromEntries(q.criteria.map((c, i) => [String(i), c])),
          probabilities: Object.fromEntries(q.criteria.map((_, i) => [String(i), i === Math.round(level) ? 1 : 0])),
        };
      } else if (q.type === "noul") {
        const value = kind === "mismatch" ? (this.opts.mismatch ?? 0.1) : kind === "challenge" ? (this.opts.challenge?.[caseId] ?? 0.2) : (this.opts.contradiction ?? 0.05);
        answers[key] = { type: "noul", noul: value };
      } else {
        const marked = this.opts.unsupportedMarker && JSON.stringify(q.instructions).includes(this.opts.unsupportedMarker);
        const verdict = marked ? "says_nothing" : (this.opts.support ?? "supports");
        answers[key] = { type: "choice", choice: verdict, confidence: 0.9, probabilities: { supports: verdict === "supports" ? 0.95 : 0.03, contradicts: 0.02, says_nothing: verdict === "supports" ? 0.03 : 0.95 } };
      }
    }
    return { model: this.model, answers, usage: { input_tokens: 1000, output_tokens: 10 } };
  }
}

export const PROFILE: ProfileDraft = {
  is_decision: true,
  decision: "Whether to replace a partly working backend the night before a demo.",
  options: ["Keep and stabilise", "Replace tonight", "Isolated experiment"],
  actors: ["User", "Teammate"],
  known_constraints: ["One day until the demo"],
  urgency: "days",
  time_horizon: "One day",
  reversibility: "unknown",
  relationship: "repeated",
  stakes: "medium",
  known_facts: ["The backend partly works"],
  user_interpretations: [],
  uncertainties: ["Is there a tested rollback?"],
  assumptions: [],
  clarification: { needed: false, questions: [] },
};

export function writerDraft(caseIds: string[]): WriterOutput {
  const points: Record<string, { text: string; claim_ids: string[] }[]> = {
    CASE_APOLLO13_TRIAGE: [{ text: "Noncritical systems were turned off and energy use cut to one-fifth.", claim_ids: ["CLM_A13_007"] }],
    CASE_APOLLO11_ALARMS: [{ text: "Engineer Steven Bales diagnosed the alarm within seconds.", claim_ids: ["CLM_A11_003"] }],
    CASE_CHALLENGER_LAUNCH: [{ text: "The Commission found NASA appeared to require proof that launching was unsafe.", claim_ids: ["CLM_CH_008"] }],
  };
  return {
    decision_summary: "You are deciding whether to rebuild before a demo.",
    assumptions: ["No rollback exists."],
    unknowns: [],
    recommendation: { text: "Stabilise the working backend.", conditions: ["No tested rollback"], basis_case_ids: [caseIds[0]] },
    conditional_alternatives: [],
    lesson_tension: null,
    comparisons: caseIds.map((id) => ({
      case_id: id,
      shared_mechanism: "A risky step under a deadline.",
      lesson: "Protect what must work before trying anything risky.",
      important_differences: ["Lower stakes"],
      applies_when: "The step cannot be undone.",
      historical_points: points[id],
      quotes: [],
    })),
    source_conflicts: [],
    next_steps: [
      { text: "Freeze the demo path.", basis_case_ids: [caseIds[0]] },
      { text: "Write down the switch criteria.", basis_case_ids: [caseIds[0]] },
    ],
    what_would_change: [{ condition: "A rollback is tested.", effect: "An experiment becomes reasonable.", constraint_key: "rollback_tested", constraint_value: "true" }],
    uncertainties: [],
  };
}

export class FakeLlm implements LlmClient {
  readonly model = "google/gemini-3.8-flash";
  writerCalls = 0;
  constructor(
    private readonly opts: {
      profile?: ProfileDraft;
      writer?: (call: number, req: LlmRequest<unknown>) => WriterOutput;
      failProfile?: Error;
      failWriter?: Error;
    } = {},
  ) {}

  async generate<T>(req: LlmRequest<T>) {
    if (req.schema === (ProfileDraftSchema as unknown)) {
      if (this.opts.failProfile) throw this.opts.failProfile;
      return { data: (this.opts.profile ?? PROFILE) as T, model: this.model, usage: { input_tokens: 1, output_tokens: 1, cost_usd: null } };
    }
    if (req.schema === (WriterOutputSchema as unknown)) {
      this.writerCalls++;
      if (this.opts.failWriter) throw this.opts.failWriter;
      const draft = this.opts.writer ? this.opts.writer(this.writerCalls, req as LlmRequest<unknown>) : writerDraft(["CASE_APOLLO13_TRIAGE"]);
      return { data: draft as T, model: this.model, usage: { input_tokens: 1, output_tokens: 1, cost_usd: null } };
    }
    throw new Error("unexpected schema");
  }
}
