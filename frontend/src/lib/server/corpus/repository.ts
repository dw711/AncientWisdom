import type { ClaimRecord, DecisionCaseRecord, EventRecord, PassageRecord, SourceRecord } from "./schema";

/**
 * Outcome-free view of an approved case, used for retrieval and Jev ranking.
 * It deliberately omits the chosen action, outcome, lesson and claims so that
 * the first ranking pass cannot favour cases by how they turned out.
 */
export interface CandidateView {
  case_id: string;
  case_version: number;
  title: string;
  decision_question: string;
  pre_decision: DecisionCaseRecord["pre_decision"];
  mechanism_tags: string[];
  event_cluster: string;
  search_text: DecisionCaseRecord["search_text"];
  evidence: { approved_claims: number; has_pre_decision_claim: boolean; has_outcome_claim: boolean };
}

/** Everything stored about a case, fetched only after selection. */
export interface CaseBundle {
  record: DecisionCaseRecord;
  event: EventRecord;
  claims: ClaimRecord[];
  passages: PassageRecord[];
  sources: SourceRecord[];
}

/**
 * Storage boundary for the historical corpus. The JSON implementation reads a
 * versioned fixture; a PostgreSQL implementation can replace it without
 * changing retrieval, ranking or synthesis code.
 */
export interface CaseRepository {
  readonly kind: string;
  corpusVersion(): Promise<string>;
  /** Approved cases only, without outcomes. */
  listCandidates(): Promise<CandidateView[]>;
  /** Approved cases only. Unknown or unapproved IDs are omitted. */
  getBundles(caseIds: string[]): Promise<CaseBundle[]>;
}

export class CorpusError extends Error {
  constructor(message: string, readonly issues: string[] = []) {
    super(message);
    this.name = "CorpusError";
  }
}
