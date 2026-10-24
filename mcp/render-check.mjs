// Renderer branch coverage for the three non-ready statuses (demo mode cannot
// produce them, so they are exercised directly against the exported renderer).
import { renderAdvice } from "./index.mjs";

const base = {
  request_id: "r1",
  mode: "live",
  sample: false,
  versions: { corpus: "x", rubric: "y" },
  profile: null,
  warnings: [],
  timings_ms: {},
  sources: [],
  passages: [],
  claims: [],
};

const clarify = {
  ...base,
  status: "needs_clarification",
  questions: [{ id: "q1", question: "Is the rollback tested?", why_it_matters: "It changes reversibility." }],
};

const insufficient = {
  ...base,
  status: "insufficient_evidence",
  reason: "no_relevant_case",
  message: "No case in the collection is close enough to draw a lesson from.",
  near_misses: [{ case_id: "C22", title: "John Snow", analogy_fit: 38, reasons: ["Different mechanism"] }],
  suggestions: ["State whether a rollback path exists"],
};

const partial = {
  ...base,
  status: "partial",
  preview: false,
  message: "The writer was unavailable, so there is no written advice.",
  missing: [{ part: "advice", reason: "writer down" }],
  ranking_status: "ok",
  decision_summary: "Whether to rebuild the night before the demo.",
  recommendation: null,
  alternatives: [],
  lesson_tension: null,
  comparisons: [],
  rated_cases: [],
  unranked_cases: [],
  challenging: null,
  challenging_note: null,
  next_steps: [],
  what_would_change: [],
  uncertainties: [],
  source_conflicts: [],
  validation: null,
};

for (const r of [clarify, insufficient, partial]) {
  const out = renderAdvice(r);
  console.log(`--- ${r.status} (${out.length} chars) ---`);
  console.log(out.slice(0, 700));
  console.log();
  if (!out.length) throw new Error(`${r.status} rendered empty`);
}
console.log("RENDER OK");
