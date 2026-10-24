import type { CandidateView, CaseBundle } from "./repository";
import type { ClaimRecord, DecisionCaseRecord, EventRecord, PassageRecord, SourceRecord } from "./schema";

/**
 * An in-memory, versioned copy of the approved corpus. Both repositories load
 * one of these (from JSON files or from PostgreSQL) and share the same
 * selection rules below, so storage can change without changing behaviour.
 */
export interface CorpusSnapshot {
  version: string;
  sources: Map<string, SourceRecord>;
  passages: Map<string, PassageRecord>;
  events: Map<string, EventRecord>;
  cases: Map<string, DecisionCaseRecord>;
  claimsByCase: Map<string, ClaimRecord[]>;
}

/** Which claims may be used as evidence. */
export type ClaimPolicy = (claim: ClaimRecord) => boolean;

export function candidatesFrom(s: CorpusSnapshot, usable: ClaimPolicy): CandidateView[] {
  return [...s.cases.values()]
    .filter((rec) => rec.review.status === "approved")
    .map((rec) => {
      const claims = (s.claimsByCase.get(rec.case_id) ?? []).filter(usable);
      return {
        case_id: rec.case_id,
        case_version: rec.version,
        title: rec.title,
        decision_question: rec.decision_question,
        pre_decision: rec.pre_decision,
        mechanism_tags: rec.mechanism_tags,
        event_cluster: rec.event_cluster,
        search_text: rec.search_text,
        evidence: {
          approved_claims: claims.length,
          has_pre_decision_claim: claims.some((cl) => cl.phase !== "outcome"),
          has_outcome_claim: claims.some((cl) => cl.phase === "outcome"),
        },
      };
    });
}

export function bundlesFrom(s: CorpusSnapshot, caseIds: string[], usable: ClaimPolicy): CaseBundle[] {
  const bundles: CaseBundle[] = [];
  for (const caseId of caseIds) {
    const record = s.cases.get(caseId);
    const event = record ? s.events.get(record.event_id) : undefined;
    if (!record || !event || record.review.status !== "approved") continue;
    const claims = (s.claimsByCase.get(caseId) ?? []).filter(usable);
    const passageIds = new Set(claims.flatMap((cl) => cl.supporting_passage_ids));
    const passages = [...passageIds].map((pid) => s.passages.get(pid)).filter((p): p is PassageRecord => Boolean(p));
    const sourceIds = new Set(passages.map((p) => p.source_id));
    const sources = [...sourceIds].map((sid) => s.sources.get(sid)).filter((x): x is SourceRecord => Boolean(x));
    bundles.push({ record, event, claims, passages, sources });
  }
  return bundles;
}
