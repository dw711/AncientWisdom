import "server-only";
import type { AdviceRequest, AdviceResponse, Comparison, ExplicitConstraints, Versions } from "@/lib/contracts/advice";
import { matchPreset } from "@/lib/demo/presets";
import type { AppConfig } from "@/lib/server/config";
import { PIPELINE_VERSION } from "@/lib/server/config";
import type { CaseBundle, CaseRepository } from "@/lib/server/corpus/repository";
import { toCaseCard } from "@/lib/server/corpus/views";
import { SAMPLE_VARIANTS } from "@/lib/server/demo/fixtures";
import { RUBRIC, RUBRIC_VERSION } from "@/lib/server/ranking/rubric";
import { buildRating, sampleDimension } from "@/lib/server/ranking/scoring";
import { lexicalMatches } from "@/lib/server/retrieval/candidates";
import { checkDraft } from "@/lib/server/validation/checks";
import { pruneDraft } from "@/lib/server/validation/prune";
import { buildChangeConditions, buildComparison } from "./assemble";
import { base, emptyPartial, type ResponseContext } from "./responses";
import { Stopwatch } from "./runtime";
import type { RunOptions } from "./live";

const CONSTRAINT_LABELS: Record<keyof ExplicitConstraints, string> = {
  deadline_hours: "deadline",
  reversibility: "reversibility",
  rollback_tested: "rollback",
  stakes: "stakes",
  relationship: "relationship",
  notes: "additional notes",
};

/**
 * Preview mode: deterministic, prewritten sample analyses for the example
 * dilemmas, served from the reviewed corpus. Any other description gets an
 * explicit preview limitation instead of a canned answer.
 */
export async function runDemoPipeline(req: AdviceRequest, repo: CaseRepository, config: AppConfig, opts: RunOptions): Promise<AdviceResponse> {
  const sw = new Stopwatch();
  const versions: Versions = {
    corpus: await repo.corpusVersion(),
    rubric: RUBRIC_VERSION,
    pipeline: PIPELINE_VERSION,
    weights: config.weightsVersion,
    jev_model: null,
    llm_model: null,
  };
  const warnings: string[] = [];
  const preset = matchPreset(req.query);
  const ctx: ResponseContext = { requestId: opts.requestId, mode: "demo", sample: Boolean(preset), versions, warnings, timings: () => sw.total() };

  if (!preset || req.language !== "en") {
    opts.onProgress?.("retrieve", "Looking for approved cases that share wording with your description");
    const matches = lexicalMatches(null, req.query, await repo.listCandidates()).filter((m) => m.score > 0.04);
    const bundles = await repo.getBundles(matches.slice(0, req.max_cases).map((m) => m.candidate.case_id));
    return {
      ...base(ctx, null, bundles),
      ...emptyPartial(),
      status: "partial",
      preview: true,
      message: bundles.length
        ? "This is a preview without live analysis. Personalised advice and analogy-fit ratings need live mode. The approved cases below share some wording with your description, but they have not been assessed for fit."
        : "This is a preview without live analysis. Personalised advice needs live mode, and no approved case shares enough wording with your description to show here.",
      missing: [
        { part: "ranking", reason: "Preview mode does not call Jev." },
        { part: "advice", reason: "Preview mode only has prewritten analyses for the example dilemmas." },
      ],
      ranking_status: "unavailable",
      unranked_cases: bundles.map(toCaseCard),
    };
  }

  opts.onProgress?.("sample", "Loading the prepared sample analysis");
  const variant = SAMPLE_VARIANTS.find((v) => v.preset_id === preset.id && v.matches(req.constraints))!;
  const ignored = (Object.keys(req.constraints) as (keyof ExplicitConstraints)[]).filter(
    (k) => req.constraints[k] !== undefined && !variant.modelled.includes(k),
  );
  warnings.push("This is a prewritten sample analysis for an example dilemma. Its fit ratings are illustrative and were not computed by Jev.");
  if (ignored.length) {
    warnings.push(`The preview does not model the ${ignored.map((k) => CONSTRAINT_LABELS[k]).join(", ")} you entered. Live mode recomputes the whole analysis from your inputs.`);
  }

  const bundleList = await repo.getBundles(variant.cases.map((c) => c.case_id));
  const bundles = new Map<string, CaseBundle>(bundleList.map((b) => [b.record.case_id, b]));
  const issues = checkDraft(variant.draft, { bundles });
  const pruned = pruneDraft(variant.draft, issues, { bundles });

  const comparisons: Comparison[] = [];
  let challenging: Comparison | null = null;
  for (const item of pruned.draft.comparisons) {
    const spec = variant.cases.find((c) => c.case_id === item.case_id)!;
    const rating = buildRating({
      dimensions: RUBRIC.map((r) => sampleDimension(r.dimension, spec.levels[r.dimension])),
      weights: config.weights,
      criticalMismatch: null,
      evidenceOk: true,
      thresholds: config.thresholds,
      source: "sample",
    });
    const comparison = buildComparison({ item, bundle: bundles.get(item.case_id)!, rating, role: spec.role, support: new Map() });
    if (spec.role === "challenging") challenging = comparison;
    else comparisons.push(comparison);
  }
  comparisons.sort((a, b) => b.rating.analogy_fit - a.rating.analogy_fit);

  // Only offer "apply this change" for assumptions the preview actually models.
  const whatWouldChange = buildChangeConditions(pruned.draft.what_would_change).map((c) =>
    c.suggested_update && !variant.modelled.includes(c.suggested_update.key) ? { ...c, suggested_update: null } : c,
  );
  const d = pruned.draft;
  return {
    ...base(ctx, { ...variant.profile, explicit_constraints: req.constraints, source: "sample" }, bundleList),
    status: "ready",
    decision_summary: d.decision_summary,
    recommendation: { ...d.recommendation, kind: "modern_inference" },
    alternatives: d.conditional_alternatives,
    lesson_tension: d.lesson_tension,
    comparisons,
    challenging,
    challenging_note: variant.challenging_note,
    next_steps: d.next_steps,
    what_would_change: whatWouldChange,
    uncertainties: [...new Set([...d.uncertainties, ...d.unknowns])],
    source_conflicts: d.source_conflicts,
    validation: {
      schema: "passed",
      evidence_ids: issues.some((i) => !i.code.startsWith("quote") && i.code !== "contradiction") ? "items_removed" : "passed",
      quotations: issues.some((i) => i.code.startsWith("quote")) ? "items_removed" : "passed",
      claim_support: "skipped",
      consistency: issues.some((i) => i.code === "contradiction") ? "items_removed" : "passed",
      repair_attempted: false,
      removed: pruned.removed,
      notes: [
        "Sample output: evidence IDs and quotations were checked against the stored corpus just now. The model-based claim-support check runs only in live mode.",
      ],
    },
  };
}
