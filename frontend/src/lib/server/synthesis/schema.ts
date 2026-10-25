import { z } from "zod";
import { CONSTRAINT_KEYS, ReversibilitySchema } from "@/lib/contracts/advice";

/**
 * Structured outputs for the two LLM calls. Counts and lengths are checked by
 * the validator rather than the schema, so violations become repairable
 * validation errors instead of opaque parse failures.
 */

export const ProfileDraftSchema = z.object({
  is_decision: z.boolean().describe("False if the text does not describe a choice the user faces."),
  decision: z.string().describe("One sentence naming the choice to be made."),
  options: z.array(z.string()).describe("The options the user is choosing between, including obvious ones they imply."),
  actors: z.array(z.string()),
  known_constraints: z.array(z.string()),
  urgency: z.enum(["immediate", "days", "weeks", "months", "years", "unknown"]),
  time_horizon: z.string(),
  reversibility: ReversibilitySchema,
  relationship: z.enum(["one_off", "repeated", "unknown"]),
  stakes: z.enum(["low", "medium", "high", "unknown"]),
  known_facts: z.array(z.string()).describe("Facts the user states directly."),
  user_interpretations: z.array(z.string()).describe("The user's readings of other people's motives or of the situation, kept separate from facts."),
  uncertainties: z.array(z.string()),
  assumptions: z.array(z.string()).describe("Assumptions you had to make to proceed. Each must be stated plainly."),
  clarification: z.object({
    needed: z.boolean().describe("True only if a missing fact would materially change any sensible recommendation."),
    questions: z.array(z.object({ question: z.string(), why_it_matters: z.string() })),
  }),
});
export type ProfileDraft = z.infer<typeof ProfileDraftSchema>;

export const ConstraintKeyOrNone = z.enum([...CONSTRAINT_KEYS, "none"]);

export const WriterOutputSchema = z.object({
  decision_summary: z.string(),
  assumptions: z.array(z.string()),
  unknowns: z.array(z.string()),
  recommendation: z.object({
    text: z.string(),
    conditions: z.array(z.string()),
    basis_case_ids: z.array(z.string()),
  }),
  conditional_alternatives: z.array(z.object({ condition: z.string(), action: z.string(), basis_case_ids: z.array(z.string()) })),
  lesson_tension: z.string().nullable(),
  comparisons: z.array(
    z.object({
      case_id: z.string(),
      shared_mechanism: z.string(),
      lesson: z.string().describe("One sentence: the lesson this case offers for the person's decision."),
      important_differences: z.array(z.string()),
      applies_when: z.string(),
      historical_points: z.array(z.object({ text: z.string(), claim_ids: z.array(z.string()) })),
      quotes: z.array(z.object({ passage_id: z.string(), text: z.string() })),
    }),
  ),
  source_conflicts: z.array(z.object({ case_id: z.string(), dispute_id: z.string(), summary: z.string() })),
  next_steps: z.array(z.object({ text: z.string(), basis_case_ids: z.array(z.string()) })),
  what_would_change: z.array(
    z.object({
      condition: z.string(),
      effect: z.string(),
      constraint_key: ConstraintKeyOrNone,
      constraint_value: z.string().describe("Proposed new value for constraint_key, or an empty string."),
    }),
  ),
  uncertainties: z.array(z.string()),
});
export type WriterOutput = z.infer<typeof WriterOutputSchema>;
