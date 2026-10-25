import { z } from "zod";

/**
 * Shared API contract for POST /api/advice and GET /api/cases/:id.
 * Imported by both the browser and the server, so it must stay free of
 * server-only dependencies.
 */

export const LIMITS = {
  queryMin: 20,
  queryMax: 4000,
  notesMax: 600,
  maxCases: 3,
  clarifications: 2,
  clarificationAnswerMax: 500,
  deadlineHoursMax: 8760,
} as const;

export const ReversibilitySchema = z.enum(["reversible", "partly_reversible", "irreversible", "unknown"]);
export type Reversibility = z.infer<typeof ReversibilitySchema>;

export const StakesSchema = z.enum(["low", "medium", "high"]);
export const RelationshipSchema = z.enum(["one_off", "repeated", "unknown"]);

export const ExplicitConstraintsSchema = z.strictObject({
  deadline_hours: z.number().min(0).max(LIMITS.deadlineHoursMax).optional(),
  reversibility: ReversibilitySchema.optional(),
  rollback_tested: z.boolean().optional(),
  stakes: StakesSchema.optional(),
  relationship: RelationshipSchema.optional(),
  notes: z.string().trim().max(LIMITS.notesMax).optional(),
});
export type ExplicitConstraints = z.infer<typeof ExplicitConstraintsSchema>;

/** Keys a "what would change the advice" item may propose updating. */
export const CONSTRAINT_KEYS = ["deadline_hours", "reversibility", "rollback_tested", "stakes", "relationship"] as const;
export type ConstraintKey = (typeof CONSTRAINT_KEYS)[number];

export const ClarificationAnswerSchema = z.strictObject({
  question: z.string().trim().min(1).max(400),
  answer: z.string().trim().min(1).max(LIMITS.clarificationAnswerMax),
});

export const AdviceRequestSchema = z.strictObject({
  query: z
    .string()
    .trim()
    .min(LIMITS.queryMin, `Please describe the dilemma in at least ${LIMITS.queryMin} characters.`)
    .max(LIMITS.queryMax, `Please keep the description under ${LIMITS.queryMax} characters.`),
  language: z.enum(["en", "zh"]).default("en"),
  max_cases: z.number().int().min(1).max(LIMITS.maxCases).default(LIMITS.maxCases),
  constraints: ExplicitConstraintsSchema.default({}),
  clarifications: z.array(ClarificationAnswerSchema).max(LIMITS.clarifications).default([]),
});
export type AdviceRequest = z.infer<typeof AdviceRequestSchema>;
export type AdviceRequestInput = z.input<typeof AdviceRequestSchema>;

// ---------------------------------------------------------------------------
// Response types. The server builds these; the client only reads them.
// ---------------------------------------------------------------------------

export type Mode = "live" | "demo";

export interface DecisionProfile {
  decision: string;
  options: string[];
  actors: string[];
  known_constraints: string[];
  urgency: "immediate" | "days" | "weeks" | "months" | "years" | "unknown";
  time_horizon: string;
  reversibility: Reversibility;
  relationship: "one_off" | "repeated" | "unknown";
  stakes: "low" | "medium" | "high" | "unknown";
  known_facts: string[];
  /** Statements that are the user's reading of a situation, not established facts. */
  user_interpretations: string[];
  uncertainties: string[];
  assumptions: string[];
  explicit_constraints: ExplicitConstraints;
  /** How the profile was produced. */
  source: "llm" | "fallback" | "sample";
}

export type Dimension = "structural" | "incentives" | "constraints" | "time";

export interface DimensionScore {
  dimension: Dimension;
  label: string;
  /** Jev expected score on the 0–4 rubric. */
  raw_score: number;
  normalised: number;
  /** Jev confidence (0–1). Null for sample ratings. */
  confidence: number | null;
  probabilities: Record<string, number> | null;
  /** Rubric level descriptions keyed by level number. */
  legend: Record<string, string>;
}

export interface AnalogyRating {
  /** Rubric rating 0–100. Not a probability of success. */
  analogy_fit: number;
  source: "jev" | "sample";
  dimensions: DimensionScore[];
  weights: Record<Dimension, number>;
  critical_mismatch_probability: number | null;
  low_confidence: boolean;
  eligible: boolean;
  ineligible_reasons: string[];
}

export interface SourceView {
  source_id: string;
  title: string;
  institution: string;
  author: string | null;
  url: string;
  archived_url: string | null;
  publication_date_display: string | null;
  retrieved_at: string;
  retrieval_note: string | null;
  rights_note: string;
  source_type: "primary" | "official_secondary" | "secondary" | "reference";
}

export interface PassageView {
  passage_id: string;
  source_id: string;
  locator: string;
  text: string;
}

export interface ClaimView {
  claim_id: string;
  case_id: string;
  statement: string;
  type: "observation" | "interpretation" | "outcome";
  phase: "pre_decision" | "decision" | "outcome" | "unspecified";
  attribution: string | null;
  /** "unverified": approved with its case but not yet individually reviewed. */
  support_status: "supported" | "unverified";
  passage_ids: string[];
}

export interface Referenced {
  text: string;
  claim_ids: string[];
}

export interface DisputeView {
  dispute_id: string;
  summary: string;
  positions: { attribution: string; position: string; claim_ids: string[] }[];
}

export interface CaseCard {
  case_id: string;
  case_version: number;
  title: string;
  display_date: string;
  date_detail: string;
  decision_question: string;
  context: Referenced;
  chosen_action: Referenced;
  outcome: Referenced & { uncertainty: string };
  mechanism_tags: string[];
  analogy_limits: string[];
  disputes: DisputeView[];
  dispute_note: string | null;
  lesson: { text: string; conditions: string[] };
  /** The decision pattern the case illustrates (interpretation). */
  pattern: string | null;
  /** For placing the case on a timeline; negative years are BCE. */
  year_start: number | null;
  year_end: number | null;
  review_status: "approved";
  reviewed_at: string;
  source_ids: string[];
}

/** Everything the story page shows about one case. */
export interface CaseStory extends CaseCard {
  geography: string;
  actors: string[];
  goals: string[];
  available_information: string[];
  options: string[];
  options_are_editorial: boolean;
  constraints: string[];
  time_pressure: string;
  reversibility: string;
}

export interface HistoricalPoint {
  text: string;
  claim_ids: string[];
  /** Result of the claim-support check against the cited passages. */
  support: "supported" | "not_checked";
  support_confidence: number | null;
}

export interface QuoteView {
  passage_id: string;
  text: string;
}

export interface Comparison {
  case: CaseCard;
  role: "supporting" | "challenging";
  rating: AnalogyRating;
  shared_mechanism: string;
  /** One-sentence lesson for the person's decision (modern inference). */
  lesson: string;
  important_differences: string[];
  applies_when: string;
  historical_points: HistoricalPoint[];
  quotes: QuoteView[];
}

export interface Recommendation {
  text: string;
  conditions: string[];
  basis_case_ids: string[];
  kind: "modern_inference";
}

export interface ConditionalAlternative {
  condition: string;
  action: string;
  basis_case_ids: string[];
}

export interface NextStep {
  text: string;
  basis_case_ids: string[];
}

export interface ChangeCondition {
  condition: string;
  effect: string;
  suggested_update: { key: ConstraintKey; value: string | number | boolean; label: string } | null;
}

export interface SourceConflict {
  case_id: string;
  dispute_id: string;
  summary: string;
}

export type CheckState = "passed" | "repaired" | "items_removed" | "failed" | "skipped" | "not_applicable";

export interface ValidationReport {
  schema: CheckState;
  evidence_ids: CheckState;
  quotations: CheckState;
  claim_support: CheckState;
  consistency: CheckState;
  repair_attempted: boolean;
  removed: { item: string; reason: string }[];
  notes: string[];
}

export interface Versions {
  corpus: string;
  rubric: string;
  pipeline: string;
  weights: string;
  jev_model: string | null;
  llm_model: string | null;
}

export interface NearMiss {
  case_id: string;
  title: string;
  analogy_fit: number | null;
  reasons: string[];
}

interface ResponseBase {
  request_id: string;
  mode: Mode;
  /** True when the content is prewritten sample output rather than a live analysis. */
  sample: boolean;
  versions: Versions;
  profile: DecisionProfile | null;
  warnings: string[];
  timings_ms: Record<string, number>;
  sources: SourceView[];
  passages: PassageView[];
  claims: ClaimView[];
}

export interface ReadyResponse extends ResponseBase {
  status: "ready";
  decision_summary: string;
  recommendation: Recommendation;
  alternatives: ConditionalAlternative[];
  lesson_tension: string | null;
  comparisons: Comparison[];
  challenging: Comparison | null;
  challenging_note: string | null;
  next_steps: NextStep[];
  what_would_change: ChangeCondition[];
  uncertainties: string[];
  source_conflicts: SourceConflict[];
  validation: ValidationReport;
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  why_it_matters: string;
}

export interface NeedsClarificationResponse extends ResponseBase {
  status: "needs_clarification";
  questions: ClarificationQuestion[];
}

export interface InsufficientEvidenceResponse extends ResponseBase {
  status: "insufficient_evidence";
  reason: "no_relevant_case" | "evidence_removed";
  message: string;
  near_misses: NearMiss[];
  suggestions: string[];
}

export interface PartialResponse extends ResponseBase {
  status: "partial";
  /** True when the partial result is the preview-mode limitation, not a failure. */
  preview: boolean;
  message: string;
  missing: { part: "ranking" | "advice" | "challenging_case" | "comparisons"; reason: string }[];
  ranking_status: "ok" | "unavailable";
  decision_summary: string | null;
  recommendation: Recommendation | null;
  alternatives: ConditionalAlternative[];
  lesson_tension: string | null;
  comparisons: Comparison[];
  /** Rated cases shown without written comparisons because the writer was unavailable. */
  rated_cases: { case: CaseCard; rating: AnalogyRating; role: "supporting" | "challenging" }[];
  /** Cases shown without a fit rating because ranking was unavailable. */
  unranked_cases: CaseCard[];
  challenging: Comparison | null;
  challenging_note: string | null;
  next_steps: NextStep[];
  what_would_change: ChangeCondition[];
  uncertainties: string[];
  source_conflicts: SourceConflict[];
  validation: ValidationReport | null;
}

export type AdviceResponse = ReadyResponse | NeedsClarificationResponse | InsufficientEvidenceResponse | PartialResponse;

/**
 * Fast evidence path for chatbot clients (docs/decisions.md §J): rated,
 * outcome-free case views. `pre_decision` is the exact block Jev ranked on;
 * nothing here reveals what was chosen or how it turned out.
 */
export interface RatedEvidenceCase {
  case_id: string;
  title: string;
  display_date: string;
  decision_question: string;
  pre_decision: {
    situation: string;
    available_information: string[];
    actors: string[];
    goals: string[];
    options: string[];
    options_are_editorial: boolean;
    incentives: string[];
    constraints: string[];
    time_pressure: string;
    reversibility: string;
  };
  mechanism_tags: string[];
  analogy_limits: string[];
  rating: AnalogyRating;
  role: "supporting" | "challenging";
}

export interface EvidenceResponse {
  kind: "evidence";
  request_id: string;
  mode: Mode;
  sample: boolean;
  versions: Versions;
  profile: DecisionProfile | null;
  warnings: string[];
  timings_ms: Record<string, number>;
  status: "ready";
  message: string;
  rated_cases: RatedEvidenceCase[];
  challenging_note: string | null;
}

export type ErrorCode =
  | "invalid_request"
  | "payload_too_large"
  | "rate_limited"
  | "provider_unconfigured"
  | "deadline_exceeded"
  | "corpus_unavailable"
  | "cancelled"
  | "internal_error";

export interface ApiError {
  request_id: string;
  error: { code: ErrorCode; message: string; details?: string[] };
}

export type ProgressStage =
  | "received"
  | "profile"
  | "clarify"
  | "retrieve"
  | "rank"
  | "challenge"
  | "evidence"
  | "write"
  | "validate"
  | "repair"
  | "sample";

/** NDJSON events streamed by POST /api/advice when the client accepts application/x-ndjson. */
export type AdviceStreamEvent =
  | { type: "progress"; stage: ProgressStage; message: string }
  | { type: "result"; http_status: number; response: AdviceResponse }
  | { type: "error"; http_status: number; error: ApiError };

export interface CaseDetailResponse {
  corpus_version: string;
  case: CaseCard;
  claims: ClaimView[];
  passages: PassageView[];
  sources: SourceView[];
}

export interface HealthResponse {
  status: "ok" | "degraded";
  mode: Mode;
  corpus: { version: string; approved_cases: number; storage: string } | null;
  providers: {
    billing: "openrouter";
    jev: { configured: boolean; model: string };
    llm: { configured: boolean; model: string };
  };
  versions: { rubric: string; pipeline: string; weights: string };
  issues: string[];
}
