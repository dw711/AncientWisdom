import "server-only";
import type { DecisionProfile } from "@/lib/contracts/advice";
import type { CaseBundle } from "@/lib/server/corpus/repository";
import type { JevClient, JevQuestion } from "@/lib/server/providers/jev";
import type { Deadline } from "@/lib/server/pipeline/runtime";
import { presentDecisionState } from "./rank";
import type { RankedCandidate } from "./rank";

export interface ChallengeResult {
  caseId: string | null;
  probabilities: Record<string, number>;
  note: string | null;
}

/**
 * Counterexample pass. Runs after the lead case is chosen, so outcomes may be
 * read here: the question is whether a comparable case shows the tentative
 * lesson failing, or the opposite approach being justified. The same
 * relevance gates apply, because only already-eligible cases are considered.
 */
export async function findChallengingCase(args: {
  profile: DecisionProfile;
  query: string;
  lead: CaseBundle;
  pool: { bundle: CaseBundle; ranked: RankedCandidate }[];
  jev: JevClient;
  threshold: number;
  deadline: Deadline;
}): Promise<ChallengeResult> {
  if (!args.pool.length) {
    return { caseId: null, probabilities: {}, note: "No other sufficiently relevant case is in the collection to test the first lesson against." };
  }
  // Database cases carry no editorial lesson, so fall back to the approach the lead case took.
  const lead = args.lead.record;
  const lesson = lead.lesson.text ? lead.lesson : { text: `The approach taken: ${lead.chosen_action.text}`, conditions: [] as string[] };
  const questions: Record<string, JevQuestion> = {};
  for (const { bundle } of args.pool) {
    questions[`${bundle.record.case_id}__challenge`] = {
      type: "noul",
      instructions: {
        task: "Does the record of the identified candidate case show that, under conditions comparable to the present decision, following the tentative lesson could be wrong, or that the opposite approach was justified?",
        candidate_case: { case_id: bundle.record.case_id, title: bundle.record.title },
        note: `Evaluate only the candidate whose case_id is ${bundle.record.case_id} in state.candidate_cases.`,
      },
      criteria: {
        true: "The candidate's record points the other way from the tentative lesson under comparable conditions, so it challenges or limits that lesson.",
        false: "The candidate's record is consistent with the tentative lesson, or is not comparable enough to challenge it.",
      },
    };
  }
  const response = await args.jev.ask(
    {
      present_decision: presentDecisionState(args.profile, args.query),
      tentative_lesson: { from_case: args.lead.record.title, lesson: lesson.text, conditions: lesson.conditions },
      candidate_cases: args.pool.map(({ bundle }) => ({
        case_id: bundle.record.case_id,
        title: bundle.record.title,
        situation: bundle.record.pre_decision.situation,
        chosen_action: bundle.record.chosen_action.text,
        outcome: bundle.record.outcome.text,
        lesson: bundle.record.lesson.text,
      })),
    },
    questions,
    { signal: args.deadline.signal, deadlineMs: args.deadline.remainingMs() },
  );

  const probabilities: Record<string, number> = {};
  for (const { bundle } of args.pool) {
    const answer = response.answers[`${bundle.record.case_id}__challenge`];
    if (answer?.type === "noul") probabilities[bundle.record.case_id] = answer.noul;
  }
  const best = args.pool
    .filter(({ bundle }) => (probabilities[bundle.record.case_id] ?? 0) >= args.threshold)
    .sort((a, b) => b.ranked.rating.analogy_fit - a.ranked.rating.analogy_fit)[0];
  return best
    ? { caseId: best.bundle.record.case_id, probabilities, note: null }
    : { caseId: null, probabilities, note: "None of the relevant cases in the collection clearly challenges the first lesson, so none is shown." };
}
