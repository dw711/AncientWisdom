import type { ConstraintKey, ExplicitConstraints, Reversibility } from "@/lib/contracts/advice";

/** UI state for the optional context panel; empty strings mean "not stated". */
export interface ContextForm {
  deadlineValue: string;
  deadlineUnit: "hours" | "days";
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
  if (f.deadlineValue.trim() && Number.isFinite(n) && n >= 0) c.deadline_hours = Math.min(8760, f.deadlineUnit === "days" ? n * 24 : n);
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
      return hours >= 48 && hours % 24 === 0
        ? { ...f, deadlineValue: String(hours / 24), deadlineUnit: "days" }
        : { ...f, deadlineValue: String(hours), deadlineUnit: "hours" };
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
