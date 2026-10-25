import type { AnalogyRating, CaseCard, ClaimView, Comparison, PartialResponse, ReadyResponse } from "@/lib/contracts/advice";
import { brief, claimNumbers } from "@/lib/case-refs";

/** One historical case in the answer, as the results view lists it. */
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

export type StageKey = "situation" | "action" | "outcome" | "lesson";

export const STAGES: { key: StageKey; label: string }[] = [
  { key: "situation", label: "The situation" },
  { key: "action", label: "What they did" },
  { key: "outcome", label: "What happened" },
  { key: "lesson", label: "The lesson" },
];

export interface Stop {
  key: StageKey;
  label: string;
  text: string;
  claimIds: string[];
  type: "observation" | "interpretation";
}

export interface ForkPath extends Entry {
  id: string;
  color: string;
  initials: string;
  short: string;
  roleLabel: string;
  stops: Stop[];
  refs: Record<string, number>;
  lesson: string | null;
}

/** Path colours in order: red, navy, then two quieter inks for a third or fourth case. */
export const PATH_COLORS = ["#E2401C", "#1E3A5F", "#8C6A1C", "#3F6B4E"];

export const ROLE_LABEL = { supporting: "Supports the advice", challenging: "Challenges the advice", unrated: "Related case" } as const;

/** "Challenger: the launch decision…" → "Challenger" */
export const shortTitle = (title: string) => title.split(/[:—–]/)[0]!.trim();

/** "Apollo 13" → "A13", "Challenger" → "Ch" */
export function initialsOf(title: string) {
  const words = shortTitle(title).split(/\s+/).filter(Boolean);
  if (words.length < 2) return (words[0] ?? "?").slice(0, 2);
  return words[0]![0]!.toUpperCase() + (/^\d+$/.test(words[1]!) ? words[1] : words[1]![0]!.toUpperCase());
}

const typeOf = (ids: string[], claims: ClaimView[]): Stop["type"] =>
  claims.some((c) => ids.includes(c.claim_id) && c.type === "interpretation") ? "interpretation" : "observation";

export function toPaths(entries: Entry[], claims: ClaimView[]): ForkPath[] {
  return entries.map((e, i) => {
    const lesson = e.comparison?.lesson || e.card.lesson.text || e.card.pattern || null;
    const stops: Stop[] = [
      { key: "situation", label: "The situation", text: brief(e.card.context.text, 150), claimIds: e.card.context.claim_ids, type: typeOf(e.card.context.claim_ids, claims) },
      { key: "action", label: "What they did", text: brief(e.card.chosen_action.text, 150), claimIds: e.card.chosen_action.claim_ids, type: typeOf(e.card.chosen_action.claim_ids, claims) },
      { key: "outcome", label: "What happened", text: brief(e.card.outcome.text, 150), claimIds: e.card.outcome.claim_ids, type: typeOf(e.card.outcome.claim_ids, claims) },
    ];
    if (lesson) stops.push({ key: "lesson", label: e.comparison?.lesson ? "The lesson for you" : "The lesson", text: brief(lesson, 150), claimIds: [], type: "interpretation" });
    return {
      ...e,
      id: e.card.case_id,
      color: PATH_COLORS[i % PATH_COLORS.length]!,
      initials: initialsOf(e.card.title),
      short: shortTitle(e.card.title),
      roleLabel: ROLE_LABEL[e.role],
      stops,
      refs: claimNumbers(e.card, e.comparison?.historical_points.map((p) => p.claim_ids) ?? []),
      lesson,
    };
  });
}

/** Stop index on `path` at fraction t along every path (0 = first stop, 1 = last). */
export const stopAt = (path: ForkPath, t: number) => Math.round(Math.min(1, Math.max(0, t)) * (path.stops.length - 1));
export const fractionOf = (path: ForkPath, i: number) => (path.stops.length > 1 ? i / (path.stops.length - 1) : 0);

/**
 * What's being looked at. `t` is a 0–1 fraction along every path, so "the same
 * point" on another path is the stop at the same fraction (the same stage).
 * source = a path id (hovering one of its stops) or "handle" (the slider).
 */
export interface Focus {
  source: string;
  t: number;
}

export const isHighlighted = (focus: Focus | null, path: ForkPath, i: number) => !!focus && stopAt(path, focus.t) === i;

export const opacityFor = (focus: Focus | null, path: ForkPath, i?: number) =>
  focus && focus.source !== "handle" && focus.source !== path.id && (i === undefined || !isHighlighted(focus, path, i)) ? 0.3 : 1;

/** Stage name at fraction t, using the path with the most stops. */
export function stageNameAt(paths: ForkPath[], t: number) {
  const longest = paths.reduce((a, b) => (b.stops.length > a.stops.length ? b : a), paths[0]!);
  return longest.stops[stopAt(longest, t)]?.label ?? "";
}
