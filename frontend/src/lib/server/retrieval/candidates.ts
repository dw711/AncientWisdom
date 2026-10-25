import type { DecisionProfile } from "@/lib/contracts/advice";
import type { CandidateView } from "@/lib/server/corpus/repository";

const STOP = new Set(
  "a an and are as at be been but by can could did do does for from had has have how i if in into is it its may me might my no not of on or our out should so than that the their them then there these they this to too up us was we were what when which while who will with would you your".split(
    " ",
  ),
);

export function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP.has(t))
      .map((t) => t.replace(/(ing|ed|es|s)$/, "")),
  );
}

function candidateText(c: CandidateView): string {
  const p = c.pre_decision;
  return [c.search_text.situation, c.search_text.mechanism, c.mechanism_tags.join(" ").replace(/_/g, " "), p.situation, p.options.join(" "), p.constraints.join(" "), p.incentives.join(" "), p.time_pressure, p.reversibility].join(" ");
}

export interface LexicalMatch {
  candidate: CandidateView;
  score: number;
}

/** Lexical overlap between the present decision and a candidate's outcome-free text. */
export function lexicalMatches(profile: DecisionProfile | null, query: string, candidates: CandidateView[]): LexicalMatch[] {
  const q = tokens(
    [query, profile?.decision, profile?.options.join(" "), profile?.known_constraints.join(" "), profile?.known_facts.join(" ")].filter(Boolean).join(" "),
  );
  return candidates
    .map((candidate) => {
      const c = tokens(candidateText(candidate));
      let overlap = 0;
      for (const t of q) if (c.has(t)) overlap++;
      return { candidate, score: q.size ? overlap / Math.sqrt(q.size * c.size) : 0 };
    })
    .sort((a, b) => b.score - a.score || a.candidate.case_id.localeCompare(b.candidate.case_id));
}

/**
 * Candidate generation. For a small corpus every approved case goes to Jev, so
 * retrieval cannot hide a structurally similar case that shares no vocabulary.
 * Above `limit`, the lexical prefilter keeps the strongest candidates; a
 * semantic route can be merged in here later.
 */
export function selectCandidates(profile: DecisionProfile, query: string, candidates: CandidateView[], limit: number): CandidateView[] {
  const ordered = lexicalMatches(profile, query, candidates).map((m) => m.candidate);
  return ordered.slice(0, limit);
}
