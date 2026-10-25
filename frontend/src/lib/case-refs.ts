import type { CaseCard } from "@/lib/contracts/advice";

/** Numbers each cited claim in reading order, so references read as [1], [2]… rather than IDs. */
export function claimNumbers(card: CaseCard, extra: string[][] = []): Record<string, number> {
  const order = [card.context.claim_ids, ...extra, card.chosen_action.claim_ids, card.outcome.claim_ids].flat();
  const refs: Record<string, number> = {};
  for (const id of order) if (!(id in refs)) refs[id] = Object.keys(refs).length + 1;
  return refs;
}

/** "217 BCE", "626", "1969"; negative years are BCE. */
export function formatYear(year: number | null): string {
  if (year === null) return "Undated";
  return year < 0 ? `${-year} BCE` : String(year);
}

/** Shortens text at a sentence or word boundary. */
export function brief(text: string, max = 220): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sentence = cut.lastIndexOf(". ");
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "") + "…";
}

/** View-transition name shared by a case's headline on the front page and its story page. */
export function headlineTransition(caseId: string): string {
  return `case-title-${caseId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}
