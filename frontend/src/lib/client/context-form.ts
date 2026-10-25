import type { ConstraintKey, ExplicitConstraints, Reversibility } from "@/lib/contracts/advice";

export type DeadlineUnit = "hours" | "days" | "weeks" | "months";

/** Hours per unit; a month is taken as 30 days. */
export const UNIT_HOURS: Record<DeadlineUnit, number> = { hours: 1, days: 24, weeks: 24 * 7, months: 24 * 30 };

/** UI state for the optional context panel; empty strings mean "not stated". */
export interface ContextForm {
  deadlineValue: string;
  deadlineUnit: DeadlineUnit;
  reversibility: "" | Reversibility;
  rollback: "" | "yes" | "no";
  stakes: "" | "low" | "medium" | "high";
  relationship: "" | "one_off" | "repeated";
  notes: string;
}

export const EMPTY_CONTEXT: ContextForm = {
  deadlineValue: "",
  deadlineUnit: "hours",
  reversibility: "",
  rollback: "",
  stakes: "",
  relationship: "",
  notes: "",
};

export function toConstraints(f: ContextForm): ExplicitConstraints {
  const c: ExplicitConstraints = {};
  const n = Number(f.deadlineValue);
  if (f.deadlineValue.trim() && Number.isFinite(n) && n >= 0) c.deadline_hours = Math.min(8760, n * UNIT_HOURS[f.deadlineUnit]);
  if (f.reversibility && f.reversibility !== "unknown") c.reversibility = f.reversibility;
  if (f.rollback) c.rollback_tested = f.rollback === "yes";
  if (f.stakes) c.stakes = f.stakes;
  if (f.relationship) c.relationship = f.relationship;
  if (f.notes.trim()) c.notes = f.notes.trim().slice(0, 600);
  return c;
}

export function countStated(f: ContextForm): number {
  return Object.keys(toConstraints(f)).length;
}

/** Applies a suggested change from "what would change the advice" to the form. */
export function applyUpdate(f: ContextForm, key: ConstraintKey, value: string | number | boolean): ContextForm {
  switch (key) {
    case "deadline_hours": {
      const hours = Number(value);
      // The largest unit that divides evenly, with at least two of it ("2 weeks", not "1 week" or "14 days").
      const unit = (["months", "weeks", "days"] as const).find((u) => hours >= 2 * UNIT_HOURS[u] && hours % UNIT_HOURS[u] === 0) ?? "hours";
      return { ...f, deadlineValue: String(hours / UNIT_HOURS[unit]), deadlineUnit: unit };
    }
    case "reversibility":
      return { ...f, reversibility: value as Reversibility };
    case "rollback_tested":
      return { ...f, rollback: value ? "yes" : "no" };
    case "stakes":
      return { ...f, stakes: value as ContextForm["stakes"] };
    case "relationship":
      return { ...f, relationship: value === "repeated" ? "repeated" : "one_off" };
  }
}
