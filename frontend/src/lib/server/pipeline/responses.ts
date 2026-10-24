import type {
  AdviceResponse,
  DecisionProfile,
  InsufficientEvidenceResponse,
  Mode,
  PartialResponse,
  Versions,
} from "@/lib/contracts/advice";
import type { CaseBundle } from "@/lib/server/corpus/repository";
import { evidenceViews } from "@/lib/server/corpus/views";

export interface ResponseContext {
  requestId: string;
  mode: Mode;
  sample: boolean;
  versions: Versions;
  warnings: string[];
  timings: () => Record<string, number>;
}

export function base(ctx: ResponseContext, profile: DecisionProfile | null, bundles: CaseBundle[] = []) {
  return {
    request_id: ctx.requestId,
    mode: ctx.mode,
    sample: ctx.sample,
    versions: ctx.versions,
    profile,
    warnings: [...new Set(ctx.warnings)],
    timings_ms: ctx.timings(),
    ...evidenceViews(bundles),
  };
}

export function emptyPartial(): Omit<PartialResponse, keyof ReturnType<typeof base> | "status" | "preview" | "message" | "missing" | "ranking_status"> {
  return {
    decision_summary: null,
    recommendation: null,
    alternatives: [],
    lesson_tension: null,
    comparisons: [],
    rated_cases: [],
    unranked_cases: [],
    challenging: null,
    challenging_note: null,
    next_steps: [],
    what_would_change: [],
    uncertainties: [],
    source_conflicts: [],
    validation: null,
  };
}

export const NO_MATCH_SUGGESTIONS = [
  "Describe the options you are choosing between and what each would cost you.",
  "Add what makes the decision hard: a deadline, something that cannot be undone, or people whose interests differ.",
  "The collection is small, so some kinds of decision have no close historical match yet.",
];

export function insufficient(
  ctx: ResponseContext,
  profile: DecisionProfile | null,
  reason: InsufficientEvidenceResponse["reason"],
  message: string,
  nearMisses: InsufficientEvidenceResponse["near_misses"],
): AdviceResponse {
  return {
    ...base(ctx, profile),
    status: "insufficient_evidence",
    reason,
    message,
    near_misses: nearMisses,
    suggestions: NO_MATCH_SUGGESTIONS,
  };
}
