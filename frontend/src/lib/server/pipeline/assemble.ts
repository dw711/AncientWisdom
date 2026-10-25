import {
  RelationshipSchema,
  ReversibilitySchema,
  StakesSchema,
  type AnalogyRating,
  type ChangeCondition,
  type Comparison,
  type ConstraintKey,
  type HistoricalPoint,
} from "@/lib/contracts/advice";
import type { CaseBundle } from "@/lib/server/corpus/repository";
import { toCaseCard } from "@/lib/server/corpus/views";
import type { WriterOutput } from "@/lib/server/synthesis/schema";
import { findExactQuote } from "@/lib/server/validation/checks";
import type { PrunedPoint } from "@/lib/server/validation/prune";
import type { PointSupport } from "@/lib/server/validation/semantic";

/**
 * Joins validated writer output back onto stored records. Case metadata,
 * ratings, quotations and links always come from the backend, never from the
 * writer.
 */
export function buildComparison(args: {
  item: WriterOutput["comparisons"][number];
  bundle: CaseBundle;
  rating: AnalogyRating;
  role: "supporting" | "challenging";
  support: Map<string, PointSupport>;
}): Comparison {
  const passages = new Map(args.bundle.passages.map((p) => [p.passage_id, p]));
  const historical_points: HistoricalPoint[] = args.item.historical_points.map((p) => {
    const s = args.support.get((p as PrunedPoint)._path ?? "");
    return {
      text: p.text,
      claim_ids: p.claim_ids,
      support: s?.verdict === "supports" ? "supported" : "not_checked",
      support_confidence: s ? Math.round(s.confidence * 100) / 100 : null,
    };
  });
  const quotes = args.item.quotes
    .map((q) => {
      const passage = passages.get(q.passage_id);
      const exact = passage ? findExactQuote(passage.text, q.text) : null;
      return exact ? { passage_id: q.passage_id, text: exact } : null;
    })
    .filter((q): q is { passage_id: string; text: string } => q !== null);
  return {
    case: toCaseCard(args.bundle),
    role: args.role,
    rating: args.rating,
    shared_mechanism: args.item.shared_mechanism,
    lesson: args.item.lesson,
    important_differences: args.item.important_differences,
    applies_when: args.item.applies_when,
    historical_points,
    quotes,
  };
}

const LABELS: Record<ConstraintKey, (v: string | number | boolean) => string> = {
  deadline_hours: (v) => `Deadline: about ${v} hours`,
  reversibility: (v) => `Reversibility: ${String(v).replace("_", " ")}`,
  rollback_tested: (v) => (v ? "A rollback has been tested" : "No tested rollback"),
  stakes: (v) => `Stakes: ${v}`,
  relationship: (v) => `Relationship: ${String(v).replace("_", "-")}`,
};

function parseValue(key: ConstraintKey, raw: string): string | number | boolean | null {
  const v = raw.trim().toLowerCase();
  switch (key) {
    case "rollback_tested":
      return v === "true" || v === "yes" ? true : v === "false" || v === "no" ? false : null;
    case "deadline_hours": {
      const n = Number(v.replace(/[^0-9.]/g, ""));
      return Number.isFinite(n) && n > 0 && n <= 8760 ? n : null;
    }
    case "reversibility": {
      const parsed = ReversibilitySchema.safeParse(v.replace(/[\s-]+/g, "_"));
      return parsed.success ? parsed.data : null;
    }
    case "stakes":
      return StakesSchema.safeParse(v).success ? v : null;
    case "relationship": {
      const r = v.replace(/[\s-]+/g, "_");
      return RelationshipSchema.safeParse(r).success ? r : null;
    }
  }
}

export function buildChangeConditions(items: WriterOutput["what_would_change"]): ChangeCondition[] {
  return items.slice(0, 5).map((item) => {
    let suggested_update: ChangeCondition["suggested_update"] = null;
    if (item.constraint_key !== "none") {
      const value = parseValue(item.constraint_key, item.constraint_value);
      if (value !== null) suggested_update = { key: item.constraint_key, value, label: LABELS[item.constraint_key](value) };
    }
    return { condition: item.condition, effect: item.effect, suggested_update };
  });
}
