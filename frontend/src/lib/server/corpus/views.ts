import type { CaseCard, CaseStory, ClaimView, PassageView, SourceView } from "@/lib/contracts/advice";

/** Reads a (possibly negative, i.e. BCE) year from "-217", "1970-04-11" or similar. */
function yearOf(value: string | null): number | null {
  const m = value?.match(/^(-?\d{1,4})/);
  return m ? Number(m[1]) : null;
}
import type { CaseBundle } from "./repository";

export function toCaseCard(bundle: CaseBundle): CaseCard {
  const { record, event, sources } = bundle;
  return {
    case_id: record.case_id,
    case_version: record.version,
    title: record.title,
    display_date: record.display_date,
    date_detail: event.date.display,
    decision_question: record.decision_question,
    context: record.context_summary,
    chosen_action: record.chosen_action,
    outcome: record.outcome,
    mechanism_tags: record.mechanism_tags,
    analogy_limits: record.analogy_limits,
    disputes: record.interpretation_disputes,
    dispute_note: record.dispute_note,
    lesson: record.lesson,
    pattern: record.pattern ?? null,
    year_start: yearOf(event.date.start),
    year_end: yearOf(event.date.end) ?? yearOf(event.date.start),
    review_status: "approved",
    reviewed_at: record.review.reviewed_at,
    source_ids: sources.map((s) => s.source_id),
  };
}

export function toCaseStory(bundle: CaseBundle): CaseStory {
  const p = bundle.record.pre_decision;
  return {
    ...toCaseCard(bundle),
    geography: bundle.event.geography,
    actors: p.actors,
    goals: p.goals,
    available_information: p.available_information,
    options: p.options,
    options_are_editorial: p.options_are_editorial,
    constraints: p.constraints,
    time_pressure: p.time_pressure,
    reversibility: p.reversibility,
  };
}

export function toClaimViews(bundle: CaseBundle): ClaimView[] {
  return bundle.claims.map((c) => ({
    claim_id: c.claim_id,
    case_id: c.case_id,
    statement: c.statement,
    type: c.type,
    phase: c.phase,
    attribution: c.attribution,
    support_status: c.support_status,
    passage_ids: c.supporting_passage_ids,
  }));
}

export function toPassageViews(bundle: CaseBundle): PassageView[] {
  return bundle.passages.map((p) => ({ passage_id: p.passage_id, source_id: p.source_id, locator: p.locator, text: p.text }));
}

export function toSourceViews(bundle: CaseBundle): SourceView[] {
  return bundle.sources.map((s) => ({
    source_id: s.source_id,
    title: s.title,
    institution: s.institution,
    author: s.author,
    url: s.url,
    archived_url: s.archived_url,
    publication_date_display: s.publication_date_display,
    retrieved_at: s.retrieved_at,
    retrieval_note: s.retrieval_note,
    rights_note: s.rights.note,
    source_type: s.source_type,
  }));
}

/** Evidence views for several bundles, de-duplicated by ID. */
export function evidenceViews(bundles: CaseBundle[]) {
  const sources = new Map<string, SourceView>();
  const passages = new Map<string, PassageView>();
  const claims = new Map<string, ClaimView>();
  for (const b of bundles) {
    for (const s of toSourceViews(b)) sources.set(s.source_id, s);
    for (const p of toPassageViews(b)) passages.set(p.passage_id, p);
    for (const c of toClaimViews(b)) claims.set(c.claim_id, c);
  }
  return { sources: [...sources.values()], passages: [...passages.values()], claims: [...claims.values()] };
}
