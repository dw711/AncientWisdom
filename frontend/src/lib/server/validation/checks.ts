import type { CaseBundle } from "@/lib/server/corpus/repository";
import type { WriterOutput } from "@/lib/server/synthesis/schema";

export type IssueCode =
  | "unknown_case"
  | "missing_comparison"
  | "duplicate_comparison"
  | "claim_not_in_case"
  | "point_without_claims"
  | "quote_unknown_passage"
  | "quote_not_exact"
  | "quote_too_long"
  | "quote_too_short"
  | "url_in_text"
  | "too_many_next_steps"
  | "too_few_next_steps"
  | "unconditional_recommendation"
  | "basis_unknown_case"
  | "unknown_dispute"
  | "contradiction"
  | "unsupported_point";

export interface Issue {
  code: IssueCode;
  /** Location in the draft, e.g. comparisons[1].historical_points[0]. */
  path: string;
  message: string;
}

export interface CheckContext {
  bundles: Map<string, CaseBundle>;
}

const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/i;

/** Normalises whitespace and typographic quote marks, which are 1:1 with the stored passage text. */
export function normaliseForQuote(text: string): string {
  return text.replace(/[‘’‛′]/g, "'").replace(/[“”„″]/g, '"').replace(/\s+/g, " ").trim();
}

/** Returns the exact stored substring a quotation matches, or null. */
export function findExactQuote(passageText: string, quote: string): string | null {
  const q = normaliseForQuote(quote).replace(/^["']|["']$/g, "");
  if (q.length < 8) return null;
  const p = normaliseForQuote(passageText);
  const index = p.indexOf(q);
  if (index < 0) return null;
  // Passages are stored whitespace-normalised, so offsets map back 1:1.
  return passageText.slice(index, index + q.length);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, " ").trim();

/** Deterministic checks. Semantic checks (claim support, contradictions) run separately via Jev. */
export function checkDraft(draft: WriterOutput, ctx: CheckContext): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();

  draft.comparisons.forEach((c, i) => {
    const at = `comparisons[${i}]`;
    const bundle = ctx.bundles.get(c.case_id);
    if (!bundle) {
      issues.push({ code: "unknown_case", path: at, message: `Comparison ${i + 1} uses case_id "${c.case_id}", which is not one of the supplied cases.` });
      return;
    }
    if (seen.has(c.case_id)) issues.push({ code: "duplicate_comparison", path: at, message: `Case ${c.case_id} has more than one comparison.` });
    seen.add(c.case_id);
    const claimIds = new Set(bundle.claims.map((cl) => cl.claim_id));
    const passages = new Map(bundle.passages.map((p) => [p.passage_id, p]));

    c.historical_points.forEach((p, j) => {
      const pat = `${at}.historical_points[${j}]`;
      if (!p.claim_ids.length) issues.push({ code: "point_without_claims", path: pat, message: `A historical point for ${c.case_id} cites no claim IDs.` });
      for (const id of p.claim_ids) {
        if (!claimIds.has(id)) issues.push({ code: "claim_not_in_case", path: pat, message: `Claim ID "${id}" is not an approved claim for ${c.case_id}.` });
      }
    });
    c.quotes.forEach((q, j) => {
      const qat = `${at}.quotes[${j}]`;
      const passage = passages.get(q.passage_id);
      if (!passage) {
        issues.push({ code: "quote_unknown_passage", path: qat, message: `Quotation cites passage "${q.passage_id}", which is not an approved passage for ${c.case_id}.` });
      } else if (!findExactQuote(passage.text, q.text)) {
        issues.push({ code: "quote_not_exact", path: qat, message: `A quotation attributed to ${q.passage_id} does not appear word for word in that passage.` });
      } else if (q.text.trim().split(/\s+/).length > 60) {
        issues.push({ code: "quote_too_long", path: qat, message: `A quotation from ${q.passage_id} is longer than 60 words.` });
      } else if (q.text.trim().split(/\s+/).length < 5) {
        issues.push({ code: "quote_too_short", path: qat, message: `A quotation from ${q.passage_id} is too short to say anything substantive.` });
      }
    });
    const disputes = new Set(bundle.record.interpretation_disputes.map((d) => d.dispute_id));
    draft.source_conflicts.forEach((s, j) => {
      if (s.case_id === c.case_id && !disputes.has(s.dispute_id)) {
        issues.push({ code: "unknown_dispute", path: `source_conflicts[${j}]`, message: `Dispute "${s.dispute_id}" is not recorded for ${c.case_id}.` });
      }
    });
  });

  for (const id of ctx.bundles.keys()) {
    if (!seen.has(id)) issues.push({ code: "missing_comparison", path: "comparisons", message: `There is no comparison for supplied case ${id}.` });
  }
  draft.source_conflicts.forEach((s, j) => {
    if (!ctx.bundles.has(s.case_id)) issues.push({ code: "unknown_dispute", path: `source_conflicts[${j}]`, message: `A source conflict refers to unknown case "${s.case_id}".` });
  });

  const basisChecks: [string, string[]][] = [
    ["recommendation", draft.recommendation.basis_case_ids],
    ...draft.conditional_alternatives.map((a, i): [string, string[]] => [`conditional_alternatives[${i}]`, a.basis_case_ids]),
    ...draft.next_steps.map((s, i): [string, string[]] => [`next_steps[${i}]`, s.basis_case_ids]),
  ];
  for (const [path, ids] of basisChecks) {
    for (const id of ids) {
      if (!ctx.bundles.has(id)) issues.push({ code: "basis_unknown_case", path, message: `${path} relies on "${id}", which is not a supplied case.` });
    }
  }

  if (!draft.recommendation.conditions.length) {
    issues.push({ code: "unconditional_recommendation", path: "recommendation", message: "The recommendation states no conditions under which it applies." });
  }
  if (draft.next_steps.length > 3) issues.push({ code: "too_many_next_steps", path: "next_steps", message: "Give no more than three next steps." });
  if (draft.next_steps.length < 2) issues.push({ code: "too_few_next_steps", path: "next_steps", message: "Give at least two concrete next steps." });

  const texts: [string, string][] = [
    ["decision_summary", draft.decision_summary],
    ["recommendation", draft.recommendation.text],
    ...draft.recommendation.conditions.map((t, i): [string, string] => [`recommendation.conditions[${i}]`, t]),
    ...draft.conditional_alternatives.flatMap((a, i): [string, string][] => [
      [`conditional_alternatives[${i}]`, a.condition],
      [`conditional_alternatives[${i}]`, a.action],
    ]),
    ...draft.comparisons.flatMap((c, i): [string, string][] => [
      [`comparisons[${i}]`, c.shared_mechanism],
      [`comparisons[${i}]`, c.lesson],
      [`comparisons[${i}]`, c.applies_when],
      ...c.important_differences.map((d): [string, string] => [`comparisons[${i}]`, d]),
      ...c.historical_points.map((p, j): [string, string] => [`comparisons[${i}].historical_points[${j}]`, p.text]),
    ]),
    ...draft.next_steps.map((s, i): [string, string] => [`next_steps[${i}]`, s.text]),
  ];
  for (const [path, text] of texts) {
    if (URL_RE.test(text)) issues.push({ code: "url_in_text", path, message: `${path} contains a URL; links come only from stored source metadata.` });
  }

  issues.push(...checkContradictions(draft));
  return issues;
}

/** Two alternatives with the same condition but different actions contradict each other. */
export function checkContradictions(draft: WriterOutput): Issue[] {
  const issues: Issue[] = [];
  const alts = draft.conditional_alternatives;
  for (let i = 0; i < alts.length; i++) {
    for (let j = i + 1; j < alts.length; j++) {
      if (norm(alts[i].condition) === norm(alts[j].condition) && norm(alts[i].action) !== norm(alts[j].action)) {
        issues.push({
          code: "contradiction",
          path: `conditional_alternatives[${j}]`,
          message: `Alternatives ${i + 1} and ${j + 1} give different actions under the same condition ("${alts[i].condition}").`,
        });
      }
    }
  }
  return issues;
}
