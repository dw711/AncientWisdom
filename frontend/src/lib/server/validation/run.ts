import "server-only";
import type { CheckState, ValidationReport } from "@/lib/contracts/advice";
import type { CaseBundle } from "@/lib/server/corpus/repository";
import type { JevClient } from "@/lib/server/providers/jev";
import type { Deadline } from "@/lib/server/pipeline/runtime";
import type { WriterOutput } from "@/lib/server/synthesis/schema";
import { checkDraft, type Issue, type IssueCode } from "./checks";
import { pruneDraft } from "./prune";
import { semanticChecks, type PointSupport } from "./semantic";

export interface ValidationOutcome {
  draft: WriterOutput;
  report: ValidationReport;
  support: Map<string, PointSupport>;
  recommendationRemoved: boolean;
}

const EVIDENCE: IssueCode[] = ["unknown_case", "missing_comparison", "duplicate_comparison", "claim_not_in_case", "point_without_claims", "basis_unknown_case", "unknown_dispute", "url_in_text"];
const QUOTES: IssueCode[] = ["quote_unknown_passage", "quote_not_exact", "quote_too_long", "quote_too_short"];
const CONSISTENCY: IssueCode[] = ["contradiction", "unconditional_recommendation", "too_many_next_steps", "too_few_next_steps"];

/** Issues that pruning handles on its own without losing anything essential. */
const PRUNE_ONLY: IssueCode[] = ["unsupported_point", "url_in_text", "too_many_next_steps", "quote_too_short"];

/**
 * A repair regenerates the whole answer (the slowest, costliest step), so it
 * is reserved for structural problems, or for unsupported points that would
 * otherwise remove an entire comparison. Single unsupported points are pruned
 * and listed as removed.
 */
export function needsRepair(draft: WriterOutput, issues: Issue[]): boolean {
  if (issues.some((i) => !PRUNE_ONLY.includes(i.code))) return true;
  const unsupported = new Set(issues.filter((i) => i.code === "unsupported_point").map((i) => i.path));
  return draft.comparisons.some(
    (c, i) => c.historical_points.length > 0 && c.historical_points.every((_, j) => unsupported.has(`comparisons[${i}].historical_points[${j}]`)),
  );
}

function state(first: Issue[], final: Issue[], codes: IssueCode[], repaired: boolean): CheckState {
  const before = first.some((i) => codes.includes(i.code));
  const after = final.some((i) => codes.includes(i.code));
  if (!before) return "passed";
  if (!after) return repaired ? "repaired" : "passed";
  return "items_removed";
}

/**
 * Validates a draft, allows exactly one repair using the actual errors, then
 * prunes whatever still fails. Model-based checks are skipped (and reported as
 * skipped) when Jev is unavailable or time has run out.
 */
export async function validateWithRepair(args: {
  draft: WriterOutput;
  bundles: Map<string, CaseBundle>;
  jev: JevClient | null;
  deadline: Deadline;
  thresholds: { supportConfidence: number; contradiction: number };
  repair: ((draft: WriterOutput, errors: string[]) => Promise<WriterOutput>) | null;
  onRepair?: () => void;
}): Promise<ValidationOutcome> {
  const ctx = { bundles: args.bundles };
  const notes: string[] = [];

  async function evaluate(draft: WriterOutput) {
    const issues = checkDraft(draft, ctx);
    let support = new Map<string, PointSupport>();
    let semanticRan = false;
    if (args.jev && args.deadline.remainingMs() > 6000) {
      try {
        const sem = await semanticChecks({
          draft,
          bundles: args.bundles,
          jev: args.jev,
          deadline: args.deadline,
          supportConfidence: args.thresholds.supportConfidence,
          contradictionThreshold: args.thresholds.contradiction,
        });
        issues.push(...sem.issues);
        support = sem.support;
        semanticRan = true;
      } catch {
        notes.push("The model-based claim-support check could not run, so only deterministic checks were applied.");
      }
    }
    return { issues, support, semanticRan };
  }

  const first = await evaluate(args.draft);
  let finalDraft = args.draft;
  let final = first;
  let repairAttempted = false;

  if (needsRepair(args.draft, first.issues) && args.repair && args.deadline.remainingMs() > 60_000) {
    repairAttempted = true;
    args.onRepair?.();
    try {
      const repaired = await args.repair(
        args.draft,
        first.issues.map((i) => i.message),
      );
      finalDraft = repaired;
      final = await evaluate(repaired);
    } catch {
      notes.push("The repair attempt failed, so items that failed checks were removed instead.");
    }
  }

  const pruned = pruneDraft(finalDraft, final.issues, ctx);
  const claimSupport: CheckState = !final.semanticRan
    ? "skipped"
    : state(first.issues, final.issues, ["unsupported_point"], repairAttempted);
  if (!args.jev) notes.push("Claim support was not model-checked because Jev is not available; evidence IDs and quotations were still checked exactly.");

  const report: ValidationReport = {
    schema: "passed",
    evidence_ids: state(first.issues, final.issues, EVIDENCE, repairAttempted),
    quotations:
      args.draft.comparisons.every((c) => !c.quotes.length) && finalDraft.comparisons.every((c) => !c.quotes.length)
        ? "not_applicable"
        : state(first.issues, final.issues, QUOTES, repairAttempted),
    claim_support: claimSupport,
    consistency: state(first.issues, final.issues, CONSISTENCY, repairAttempted),
    repair_attempted: repairAttempted,
    removed: pruned.removed,
    notes: [...new Set(notes)],
  };
  return { draft: pruned.draft, report, support: final.support, recommendationRemoved: pruned.recommendationRemoved };
}
