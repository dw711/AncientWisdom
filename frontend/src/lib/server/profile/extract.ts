import "server-only";
import type { AdviceRequest, ClarificationQuestion, DecisionProfile, ExplicitConstraints } from "@/lib/contracts/advice";
import type { LlmClient } from "@/lib/server/providers/llm";
import type { Deadline } from "@/lib/server/pipeline/runtime";
import { ProfileDraftSchema, type ProfileDraft } from "@/lib/server/synthesis/schema";
import { PROFILE_SYSTEM, profilePrompt } from "@/lib/server/synthesis/prompts";

const REVERSIBILITY_LABEL: Record<string, string> = {
  reversible: "The choice can be reversed",
  partly_reversible: "The choice can be partly reversed",
  irreversible: "The choice cannot be reversed",
};

function urgencyFromHours(hours: number): DecisionProfile["urgency"] {
  if (hours <= 6) return "immediate";
  if (hours <= 24 * 7) return "days";
  if (hours <= 24 * 60) return "weeks";
  if (hours <= 24 * 365) return "months";
  return "years";
}

function describeHours(hours: number): string {
  if (hours < 48) return `about ${Math.round(hours)} hours`;
  return `about ${Math.round(hours / 24)} days`;
}

/**
 * Explicit constraints the person entered override extracted values. Changing
 * one therefore changes the profile, which changes the Jev state, which forces
 * a fresh ranking rather than a cosmetic text edit.
 */
export function applyExplicitConstraints(profile: DecisionProfile, c: ExplicitConstraints): DecisionProfile {
  const p: DecisionProfile = {
    ...profile,
    known_constraints: [...profile.known_constraints],
    known_facts: [...profile.known_facts],
    explicit_constraints: c,
  };
  if (c.deadline_hours !== undefined) {
    p.urgency = urgencyFromHours(c.deadline_hours);
    p.time_horizon = `Deadline in ${describeHours(c.deadline_hours)}`;
    p.known_constraints.push(`Deadline in ${describeHours(c.deadline_hours)} (stated)`);
  }
  if (c.reversibility) {
    p.reversibility = c.reversibility;
    if (REVERSIBILITY_LABEL[c.reversibility]) p.known_facts.push(`${REVERSIBILITY_LABEL[c.reversibility]} (stated)`);
  }
  if (c.rollback_tested === true) p.known_facts.push("A rollback or fallback path has been tested (stated)");
  if (c.rollback_tested === false) p.known_facts.push("No tested rollback or fallback path exists (stated)");
  if (c.stakes) p.stakes = c.stakes;
  if (c.relationship) p.relationship = c.relationship;
  if (c.notes) p.known_facts.push(`Additional context: ${c.notes}`);
  return p;
}

function fromDraft(d: ProfileDraft): DecisionProfile {
  return {
    decision: d.decision,
    options: d.options.slice(0, 6),
    actors: d.actors.slice(0, 8),
    known_constraints: d.known_constraints.slice(0, 8),
    urgency: d.urgency,
    time_horizon: d.time_horizon,
    reversibility: d.reversibility,
    relationship: d.relationship,
    stakes: d.stakes,
    known_facts: d.known_facts.slice(0, 10),
    user_interpretations: d.user_interpretations.slice(0, 6),
    uncertainties: d.uncertainties.slice(0, 6),
    assumptions: d.assumptions.slice(0, 6),
    explicit_constraints: {},
    source: "llm",
  };
}

/** Used when the LLM is unavailable: ranking can still run on the person's own words. */
export function fallbackProfile(req: AdviceRequest): DecisionProfile {
  const firstSentence = req.query.split(/(?<=[.?!])\s/)[0]?.slice(0, 240) ?? req.query.slice(0, 240);
  return applyExplicitConstraints(
    {
      decision: firstSentence,
      options: [],
      actors: [],
      known_constraints: [],
      urgency: "unknown",
      time_horizon: "unknown",
      reversibility: "unknown",
      relationship: "unknown",
      stakes: "unknown",
      known_facts: [],
      user_interpretations: [],
      uncertainties: [],
      assumptions: ["The decision profile could not be extracted, so the comparison used your description directly."],
      explicit_constraints: {},
      source: "fallback",
    },
    req.constraints,
  );
}

export interface ProfileResult {
  profile: DecisionProfile;
  clarification: ClarificationQuestion[] | null;
  llmModel: string | null;
}

export async function extractProfile(req: AdviceRequest, llm: LlmClient, deadline: Deadline, timeoutMs: number, effort: "low" | "medium" | "high"): Promise<ProfileResult> {
  const result = await llm.generate({
    system: PROFILE_SYSTEM,
    prompt: profilePrompt(req),
    schema: ProfileDraftSchema,
    schemaName: "decision_profile",
    effort,
    maxTokens: 8000,
    signal: deadline.signal,
    timeoutMs: Math.min(timeoutMs, deadline.remainingMs()),
  });
  const draft = result.data;
  const profile = applyExplicitConstraints(fromDraft(draft), req.constraints);

  // Clarify at most once, and only when it materially blocks useful advice.
  let clarification: ClarificationQuestion[] | null = null;
  if (!req.clarifications.length) {
    if (!draft.is_decision) {
      clarification = [
        {
          id: "q_decision",
          question: "What is the choice you are facing, and what are the options you are weighing?",
          why_it_matters: "Historical comparisons work on the structure of a decision, so the options need to be clear.",
        },
      ];
    } else if (draft.clarification.needed && draft.clarification.questions.length && profile.options.length < 2) {
      // Models flag clarification eagerly. When the choice and at least two options
      // are clear, advice can be conditional on stated assumptions instead.
      clarification = draft.clarification.questions.slice(0, 2).map((q, i) => ({ id: `q_${i + 1}`, question: q.question, why_it_matters: q.why_it_matters }));
    }
  }
  return { profile, clarification, llmModel: result.model };
}
