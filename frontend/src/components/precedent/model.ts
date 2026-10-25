import type { AnalogyRating, CaseCard, Comparison, PartialResponse, ReadyResponse } from "@/lib/contracts/advice";
import { claimNumbers } from "@/lib/case-refs";

/** One historical case in the answer, as the results list it. */
export interface Entry {
  card: CaseCard;
  role: "supporting" | "challenging" | "unrated";
  comparison: Comparison | null;
  rating: AnalogyRating | null;
  note?: string;
}

/** Every case in the answer, in date order (same selection as the original timeline). */
export function collectEntries(r: ReadyResponse | PartialResponse): Entry[] {
  const partial = r.status === "partial" ? r : null;
  return [
    ...r.comparisons.map((c) => ({ card: c.case, role: c.role, comparison: c, rating: c.rating })),
    ...(r.challenging ? [{ card: r.challenging.case, role: "challenging" as const, comparison: r.challenging, rating: r.challenging.rating }] : []),
    ...(partial?.rated_cases.map((c) => ({ card: c.case, role: c.role, comparison: null, rating: c.rating, note: "Rated by Jev. The written comparison is unavailable for this result." })) ?? []),
    ...(partial?.unranked_cases.map((card) => ({
      card,
      role: "unrated" as const,
      comparison: null,
      rating: null,
      note: partial.preview ? "Shares wording with your description. Not assessed for fit." : "Not rated: the analogy assessment was unavailable.",
    })) ?? []),
  ].sort((a, b) => (a.card.year_start ?? Infinity) - (b.card.year_start ?? Infinity));
}

/** Edition colours follow the newsprint palette: red, black, then two quieter inks. */
export const EDITION_COLORS = ["#C1272D", "#111111", "#6B5E4B", "#2F4A5C"];

export const ROLE_KICKER = { supporting: "Supports the advice", challenging: "Challenges the advice", unrated: "Related case" } as const;

export const letterOf = (i: number) => String.fromCharCode(65 + i);

/** "Challenger: the launch decision…" → "Challenger" */
export const shortTitle = (title: string) => title.split(/[:—–]/)[0]!.trim();

/** "Apollo 13" → "A13", "Challenger" → "Ch" */
export function initialsOf(title: string) {
  const words = shortTitle(title).split(/\s+/).filter(Boolean);
  if (words.length < 2) return (words[0] ?? "?").slice(0, 2);
  return words[0]![0]!.toUpperCase() + (/^\d+$/.test(words[1]!) ? words[1] : words[1]![0]!.toUpperCase());
}

export interface Edition extends Entry {
  id: string;
  letter: string;
  color: string;
  initials: string;
  short: string;
  refs: Record<string, number>;
  lesson: string | null;
}

export function toEditions(entries: Entry[]): Edition[] {
  return entries.map((e, i) => ({
    ...e,
    id: e.card.case_id,
    letter: letterOf(i),
    color: EDITION_COLORS[i % EDITION_COLORS.length]!,
    initials: initialsOf(e.card.title),
    short: shortTitle(e.card.title),
    refs: claimNumbers(e.card, e.comparison?.historical_points.map((p) => p.claim_ids) ?? []),
    lesson: e.comparison?.lesson || e.card.lesson.text || e.card.pattern || null,
  }));
}
