import type { WriterOutput } from "@/lib/server/synthesis/schema";
import type { CheckContext, Issue } from "./checks";

export type PrunedPoint = WriterOutput["comparisons"][number]["historical_points"][number] & { _path?: string };

export interface PruneResult {
  draft: WriterOutput;
  removed: { item: string; reason: string }[];
  recommendationRemoved: boolean;
}

const strip = (s: string) => s.replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "").replace(/\s{2,}/g, " ").trim();

/**
 * Removes material that failed validation, then removes advice that depended
 * only on removed comparisons. Nothing is rewritten: an item either survives
 * as written or is dropped.
 */
export function pruneDraft(input: WriterOutput, issues: Issue[], ctx: CheckContext): PruneResult {
  const draft: WriterOutput = structuredClone(input);
  const removed: PruneResult["removed"] = [];
  const failing = (prefix: string, codes?: Issue["code"][]) =>
    issues.find((i) => (i.path === prefix || i.path.startsWith(prefix + ".")) && (!codes || codes.includes(i.code)));

  // Comparisons: drop unknown cases and duplicates, then failed points and quotes.
  const kept: WriterOutput["comparisons"] = [];
  const seen = new Set<string>();
  draft.comparisons.forEach((c, i) => {
    const at = `comparisons[${i}]`;
    const bundle = ctx.bundles.get(c.case_id);
    if (!bundle || seen.has(c.case_id)) {
      removed.push({ item: `Comparison for ${c.case_id}`, reason: bundle ? "Duplicate comparison" : "Not one of the selected cases" });
      return;
    }
    seen.add(c.case_id);
    const claimIds = new Set(bundle.claims.map((cl) => cl.claim_id));
    c.historical_points = c.historical_points.filter((p, j) => {
      const pat = `${at}.historical_points[${j}]`;
      // Remember the pre-pruning location so support results can be matched afterwards.
      (p as PrunedPoint)._path = pat;
      const unsupported = issues.find((x) => x.path === pat && x.code === "unsupported_point");
      if (unsupported) {
        removed.push({ item: `Historical point: "${p.text.slice(0, 80)}"`, reason: "Cited passages did not clearly support it" });
        return false;
      }
      p.claim_ids = p.claim_ids.filter((id) => claimIds.has(id));
      if (!p.claim_ids.length) {
        removed.push({ item: `Historical point: "${p.text.slice(0, 80)}"`, reason: "No valid evidence ID" });
        return false;
      }
      return true;
    });
    c.quotes = c.quotes.filter((q, j) => {
      const bad = failing(`${at}.quotes[${j}]`);
      if (bad) {
        const reason = bad.code === "quote_not_exact" ? "Not an exact quotation" : bad.code === "quote_too_short" ? "Too short to be meaningful" : "Invalid passage reference or length";
        removed.push({ item: `Quotation from ${q.passage_id}`, reason });
      }
      return !bad;
    });
    c.shared_mechanism = strip(c.shared_mechanism);
    c.lesson = strip(c.lesson);
    c.applies_when = strip(c.applies_when);
    c.important_differences = c.important_differences.map(strip).filter(Boolean);
    if (!c.historical_points.length) {
      removed.push({ item: `Comparison for ${c.case_id}`, reason: "No historical point survived the evidence checks" });
      return;
    }
    kept.push(c);
  });
  draft.comparisons = kept;
  const surviving = new Set(kept.map((c) => c.case_id));

  // Advice depending only on removed comparisons is removed with them.
  const keepBasis = (ids: string[]) => ids.filter((id) => surviving.has(id));
  let recommendationRemoved = false;
  const recBasis = keepBasis(draft.recommendation.basis_case_ids);
  if (!surviving.size || (draft.recommendation.basis_case_ids.length && !recBasis.length)) {
    recommendationRemoved = true;
    removed.push({ item: "Recommendation", reason: "Its supporting comparisons did not pass the evidence checks" });
  }
  draft.recommendation.basis_case_ids = recBasis;
  draft.recommendation.text = strip(draft.recommendation.text);

  const contradiction = issues.some((i) => i.code === "contradiction");
  draft.conditional_alternatives = draft.conditional_alternatives.filter((a) => {
    if (contradiction) {
      removed.push({ item: `Alternative: "${a.condition}"`, reason: "Conflicted with other advice under the same conditions" });
      return false;
    }
    if (a.basis_case_ids.length && !keepBasis(a.basis_case_ids).length) {
      removed.push({ item: `Alternative: "${a.condition}"`, reason: "Depended on a removed comparison" });
      return false;
    }
    a.basis_case_ids = keepBasis(a.basis_case_ids);
    return true;
  });

  draft.next_steps = draft.next_steps
    .filter((s) => {
      if (s.basis_case_ids.length && !keepBasis(s.basis_case_ids).length) {
        removed.push({ item: `Next step: "${s.text.slice(0, 80)}"`, reason: "Depended on a removed comparison" });
        return false;
      }
      s.basis_case_ids = keepBasis(s.basis_case_ids);
      s.text = strip(s.text);
      return Boolean(s.text);
    })
    .slice(0, 3);

  draft.source_conflicts = draft.source_conflicts.filter((s) => {
    const bundle = ctx.bundles.get(s.case_id);
    const ok = surviving.has(s.case_id) && bundle?.record.interpretation_disputes.some((d) => d.dispute_id === s.dispute_id);
    if (!ok) removed.push({ item: `Source conflict ${s.dispute_id}`, reason: "Not a recorded dispute for a shown case" });
    return ok;
  });

  return { draft, removed, recommendationRemoved };
}
