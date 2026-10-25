import "server-only";
import type { AnalogyRating, DecisionProfile, Dimension, DimensionScore } from "@/lib/contracts/advice";
import type { CandidateView } from "@/lib/server/corpus/repository";
import type { JevClient, JevQuestion, NoulAnswer, ScoreAnswer } from "@/lib/server/providers/jev";
import { JevError } from "@/lib/server/providers/jev";
import { redact } from "@/lib/server/privacy";
import { mapWithConcurrency, type Deadline } from "@/lib/server/pipeline/runtime";
import { CRITICAL_MISMATCH, RUBRIC } from "./rubric";
import { buildRating, TOP_LEVEL, type Thresholds } from "./scoring";

export interface RankedCandidate {
  candidate: CandidateView;
  rating: AnalogyRating;
}

export interface RankingResult {
  ranked: RankedCandidate[];
  /** Candidates excluded before ranking, for example for missing evidence. */
  excluded: { candidate: CandidateView; reasons: string[] }[];
  jevModel: string | null;
  inputTokens: number;
}

/** The present decision as Jev sees it: the extracted profile plus a redacted excerpt of the user's words. */
export function presentDecisionState(profile: DecisionProfile, query: string) {
  return {
    summary: profile.decision,
    options: profile.options,
    people_involved: profile.actors,
    constraints: profile.known_constraints,
    known_facts: profile.known_facts,
    urgency: profile.urgency,
    time_horizon: profile.time_horizon,
    reversibility: profile.reversibility,
    relationship: profile.relationship,
    stakes: profile.stakes,
    open_questions: profile.uncertainties,
    users_own_words: redact(query).slice(0, 1500),
  };
}

/** Pre-decision card: no chosen action, outcome or lesson. */
export function candidateState(c: CandidateView) {
  return {
    case_id: c.case_id,
    title: c.title,
    decision_question: c.decision_question,
    situation: c.pre_decision.situation,
    available_information: c.pre_decision.available_information,
    people_involved: c.pre_decision.actors,
    goals: c.pre_decision.goals,
    options: c.pre_decision.options,
    incentives: c.pre_decision.incentives,
    constraints: c.pre_decision.constraints,
    time_pressure: c.pre_decision.time_pressure,
    reversibility: c.pre_decision.reversibility,
  };
}

const qid = (caseId: string, key: string) => `${caseId}__${key}`;

/**
 * Questions for one candidate. Every instruction names the target case
 * explicitly, because several candidates can share one request's state and the
 * question key is never shown to the model.
 */
export function candidateQuestions(c: CandidateView): Record<string, JevQuestion> {
  const target = { case_id: c.case_id, title: c.title };
  const questions: Record<string, JevQuestion> = {};
  for (const r of RUBRIC) {
    questions[qid(c.case_id, r.dimension)] = {
      type: "score",
      instructions: {
        task: r.question,
        compare: "state.present_decision",
        against_candidate_case: target,
        note: `Evaluate only the candidate whose case_id is ${c.case_id} in state.candidate_cases; ignore the other candidates.`,
      },
      criteria: [...r.levels],
    };
  }
  questions[qid(c.case_id, "mismatch")] = {
    type: "noul",
    instructions: {
      ...CRITICAL_MISMATCH.instructions,
      compare: "state.present_decision",
      against_candidate_case: target,
      note: `Evaluate only the candidate whose case_id is ${c.case_id} in state.candidate_cases.`,
    },
    criteria: CRITICAL_MISMATCH.criteria,
  };
  return questions;
}

function toDimension(dimension: Dimension, answer: ScoreAnswer): DimensionScore {
  const rubric = RUBRIC.find((r) => r.dimension === dimension)!;
  const raw = Math.min(TOP_LEVEL, Math.max(0, answer.score));
  return {
    dimension,
    label: rubric.label,
    raw_score: Math.round(raw * 100) / 100,
    normalised: Math.round((raw / TOP_LEVEL) * 1000) / 1000,
    confidence: Math.min(1, Math.max(0, answer.confidence)),
    probabilities: answer.probabilities,
    legend: Object.fromEntries(rubric.levels.map((text, i) => [String(i), text])),
  };
}

export function evidenceGate(c: CandidateView): string[] {
  const reasons: string[] = [];
  if (c.evidence.approved_claims < 3) reasons.push("Fewer than three approved claims are stored.");
  if (!c.evidence.has_pre_decision_claim) reasons.push("No sourced claim describes the situation before the decision.");
  if (!c.evidence.has_outcome_claim) reasons.push("No sourced claim describes what happened afterwards.");
  return reasons;
}

export async function rankCandidates(args: {
  profile: DecisionProfile;
  query: string;
  candidates: CandidateView[];
  jev: JevClient;
  weights: Record<Dimension, number>;
  thresholds: Thresholds;
  batchSize: number;
  concurrency: number;
  deadline: Deadline;
}): Promise<RankingResult> {
  const excluded: RankingResult["excluded"] = [];
  const eligible: CandidateView[] = [];
  for (const c of args.candidates) {
    const reasons = evidenceGate(c);
    if (reasons.length) excluded.push({ candidate: c, reasons });
    else eligible.push(c);
  }
  if (!eligible.length) return { ranked: [], excluded, jevModel: null, inputTokens: 0 };

  const batches: CandidateView[][] = [];
  for (let i = 0; i < eligible.length; i += args.batchSize) batches.push(eligible.slice(i, i + args.batchSize));
  const present = presentDecisionState(args.profile, args.query);

  let jevModel: string | null = null;
  let inputTokens = 0;
  const results = await mapWithConcurrency(batches, args.concurrency, async (batch) => {
    args.deadline.ensure("ranking", 2000);
    const questions = Object.assign({}, ...batch.map(candidateQuestions)) as Record<string, JevQuestion>;
    const response = await args.jev.ask(
      { present_decision: present, candidate_cases: batch.map(candidateState) },
      questions,
      { signal: args.deadline.signal, deadlineMs: args.deadline.remainingMs() },
    );
    jevModel = response.model;
    inputTokens += response.usage.input_tokens;
    return batch.map((c): RankedCandidate => {
      const dimensions = RUBRIC.map((r) => {
        const a = response.answers[qid(c.case_id, r.dimension)];
        if (!a || a.type !== "score") throw new JevError("invalid_response", `Jev did not return ${r.dimension} for ${c.case_id}`);
        return toDimension(r.dimension, a);
      });
      const mismatch = response.answers[qid(c.case_id, "mismatch")] as NoulAnswer | undefined;
      return {
        candidate: c,
        rating: buildRating({
          dimensions,
          weights: args.weights,
          criticalMismatch: mismatch?.type === "noul" ? mismatch.noul : null,
          evidenceOk: true,
          thresholds: args.thresholds,
          source: "jev",
        }),
      };
    });
  });

  const ranked = results.flat().sort((a, b) => b.rating.analogy_fit - a.rating.analogy_fit);
  return { ranked, excluded, jevModel, inputTokens };
}
