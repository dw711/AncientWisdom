import type { NearMiss } from "@/lib/contracts/advice";
import type { RankedCandidate } from "./rank";

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return union ? inter / union : 0;
}

/**
 * Picks up to `max` eligible cases, balancing fit and diversity: a case from
 * the same event cluster with heavily overlapping mechanisms is skipped while
 * a more varied eligible case remains.
 */
export function selectCases(ranked: RankedCandidate[], max: number): { selected: RankedCandidate[]; nearMisses: NearMiss[] } {
  const eligible = ranked.filter((r) => r.rating.eligible);
  const selected: RankedCandidate[] = [];
  const deferred: RankedCandidate[] = [];
  for (const r of eligible) {
    if (selected.length >= max) break;
    const duplicate = selected.some(
      (s) => s.candidate.event_cluster === r.candidate.event_cluster && jaccard(s.candidate.mechanism_tags, r.candidate.mechanism_tags) >= 0.5,
    );
    if (duplicate) deferred.push(r);
    else selected.push(r);
  }
  for (const r of deferred) if (selected.length < max) selected.push(r);

  const nearMisses = ranked
    .filter((r) => !r.rating.eligible)
    .map((r) => ({
      case_id: r.candidate.case_id,
      title: r.candidate.title,
      analogy_fit: r.rating.analogy_fit,
      reasons: r.rating.ineligible_reasons,
    }));
  return { selected, nearMisses };
}
