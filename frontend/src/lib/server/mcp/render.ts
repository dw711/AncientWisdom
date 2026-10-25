import type {
  AdviceResponse,
  AnalogyRating,
  CaseDetailResponse,
  Comparison,
  EvidenceResponse,
  PartialResponse,
  PassageView,
  ReadyResponse,
  SourceView,
  ValidationReport,
} from "@/lib/contracts/advice";

/**
 * Server-side markdown rendering for assistant surfaces (docs/decisions.md §I):
 * the tool returns the validated structured response PLUS this rendering, and
 * the skill tells the host to present it mostly as-is. Quotes, facts and
 * source links come only from the validated response; this renderer adds no
 * historical content of its own.
 */

const esc = (s: string | null | undefined): string => String(s ?? "").replace(/\s+/g, " ").trim();

function renderSources(sources: SourceView[] | undefined): string[] {
  if (!sources?.length) return [];
  const lines = ["## Sources"];
  sources.forEach((s, i) => {
    const archived = s.archived_url ? ` ([archived copy](${s.archived_url}))` : "";
    const by = s.author ? ` — ${esc(s.author)}` : s.institution ? ` — ${esc(s.institution)}` : "";
    lines.push(`${i + 1}. [${esc(s.title)}](${s.url})${by}${archived}`);
  });
  return lines;
}

function renderQuote(q: { passage_id: string; text: string }, passages: PassageView[], sources: SourceView[]): string[] {
  const p = passages.find((x) => x.passage_id === q.passage_id);
  const s = p ? sources.find((x) => x.source_id === p.source_id) : null;
  const from = s ? `— ${esc(s.title)}${p?.locator ? `, ${esc(p.locator)}` : ""}` : `— passage ${q.passage_id}`;
  return [`> ${esc(q.text)}`, `> ${from}`];
}

function renderRating(rating: AnalogyRating | null): string[] {
  if (!rating) return [];
  const lines = [
    `**Analogy fit: ${rating.analogy_fit}/100** — a rubric rating, not a probability${rating.source === "sample" ? " (illustrative sample rating)" : ""}.`,
  ];
  if (!rating.eligible && rating.ineligible_reasons?.length) {
    lines.push(`*Shown despite eligibility gates:* ${rating.ineligible_reasons.map(esc).join("; ")}.`);
  }
  if (rating.low_confidence) lines.push(`*Low model confidence in this rating.*`);
  return lines;
}

function renderComparison(c: Comparison, i: number, passages: PassageView[], sources: SourceView[]): string[] {
  const lines = [`### ${i + 1}. ${esc(c.case.title)} — ${esc(c.case.display_date)} (${c.role})`];
  lines.push(...renderRating(c.rating));
  if (c.shared_mechanism) lines.push(`**Shared mechanism:** ${esc(c.shared_mechanism)}`);
  if (c.lesson) lines.push(`**Lesson for your decision:** ${esc(c.lesson)}`);
  if (c.applies_when) lines.push(`**Applies when:** ${esc(c.applies_when)}`);
  if (c.important_differences?.length) {
    lines.push("**Important differences:**");
    for (const d of c.important_differences) lines.push(`- ${esc(d)}`);
  }
  if (c.historical_points?.length) {
    lines.push("**Historical points:**");
    for (const p of c.historical_points) lines.push(`- ${esc(p.text)}`);
  }
  if (c.quotes?.length) {
    lines.push("**From the sources:**");
    for (const q of c.quotes) lines.push(...renderQuote(q, passages, sources), "");
  }
  return lines;
}

function renderRecommendation(resp: ReadyResponse | PartialResponse): string[] {
  const r = resp.recommendation;
  if (!r) return [];
  const lines = ["## Recommendation", esc(r.text)];
  if (r.conditions?.length) {
    lines.push("**Conditions:**");
    for (const c of r.conditions) lines.push(`- ${esc(c)}`);
  }
  if (resp.alternatives?.length) {
    lines.push("**Conditional alternatives:**");
    for (const a of resp.alternatives) lines.push(`- If ${esc(a.condition)}: ${esc(a.action)}`);
  }
  if (resp.lesson_tension) lines.push(`**Tension between the cases:** ${esc(resp.lesson_tension)}`);
  return lines;
}

function renderValidation(v: ValidationReport | null): string[] {
  if (!v) return [];
  const names: Record<keyof ValidationReport, string> = {
    schema: "Schema",
    evidence_ids: "Evidence IDs",
    quotations: "Exact quotations",
    claim_support: "Claim support",
    consistency: "Consistency",
    repair_attempted: "Repair attempted",
    removed: "Removed",
    notes: "Notes",
  };
  const lines = ["## How this answer was checked"];
  for (const key of Object.keys(names) as (keyof ValidationReport)[]) {
    if (key === "removed" || key === "notes") continue;
    lines.push(`- **${names[key]}:** ${String(v[key])}`);
  }
  for (const r of v.removed ?? []) lines.push(`- **Removed:** ${esc(r.item)} — ${esc(r.reason)}`);
  return lines;
}

function renderFooter(versions: AdviceResponse["versions"], mode: string, sample: boolean, requestId: string): string[] {
  const bits = [`corpus ${versions?.corpus ?? "?"}`, `rubric ${versions?.rubric ?? "?"}`, `${mode ?? "?"} mode`];
  if (sample) bits.push("sample analysis");
  return [`*${bits.join(" · ")} · request ${requestId ?? "?"}*`];
}

function renderWarnings(warnings: string[] | undefined): string[] {
  if (!warnings?.length) return [];
  return ["## Warnings", ...warnings.map((w) => `- ${esc(w)}`)];
}

function renderProfile(resp: AdviceResponse): string[] {
  const p = resp.profile;
  if (!p) return [];
  const lines = ["## Your decision as understood"];
  lines.push(`**Decision:** ${esc(p.decision)}`);
  if (p.options?.length) lines.push(`**Options:** ${p.options.map(esc).join(" · ")}`);
  if (p.known_constraints?.length) lines.push(`**Stated constraints:** ${p.known_constraints.map(esc).join("; ")}`);
  if (p.uncertainties?.length) lines.push(`**Unknowns:** ${p.uncertainties.map(esc).join("; ")}`);
  if (p.assumptions?.length) lines.push(`**Assumptions (not yet stated as facts):** ${p.assumptions.map(esc).join("; ")}`);
  return lines;
}

const compact = (parts: string[]): string => parts.filter(Boolean).join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";

/** Renders any advice-pipeline response (ready, partial, clarification, insufficient evidence). */
export function renderAdvice(resp: AdviceResponse): string {
  const parts: string[] = [];

  if (resp.status === "needs_clarification") {
    parts.push(
      "## One clarification is needed before answering",
      ...(resp.questions ?? []).map((q) => `- **${esc(q.question)}** *(why it matters: ${esc(q.why_it_matters)})*`),
      "",
      "Ask the user this question, then call the tool again with the same query plus",
      '`clarifications: [{ "question": "<the exact question text>", "answer": "<the user\'s answer>" }]`.',
    );
    return compact(parts);
  }

  if (resp.status === "insufficient_evidence") {
    parts.push("## No sufficiently relevant historical case", esc(resp.message));
    if (resp.near_misses?.length) {
      parts.push("**Nearest cases (not strong enough to draw a lesson from):**");
      for (const n of resp.near_misses) {
        const fit = n.analogy_fit != null ? ` (fit ${n.analogy_fit}/100)` : "";
        parts.push(`- ${esc(n.title)}${fit}${n.reasons?.length ? ` — ${n.reasons.map(esc).join("; ")}` : ""}`);
      }
    }
    if (resp.suggestions?.length) parts.push("**Suggestions:**", ...resp.suggestions.map((s) => `- ${esc(s)}`));
    parts.push("Report this honestly to the user; do not invent a comparison.");
    return compact(parts);
  }

  if (resp.status === "partial") {
    parts.push("## Partial answer", esc(resp.message));
    for (const m of resp.missing ?? []) parts.push(`- Missing ${m.part}: ${esc(m.reason)}`);
  }
  if (resp.sample) parts.push("**Note:** this is a prewritten sample analysis (preview mode), not a live analysis.");
  if (resp.profile) parts.push(...renderProfile(resp));
  if (resp.decision_summary) parts.push("## The decision", esc(resp.decision_summary));
  parts.push(...renderRecommendation(resp));

  if (resp.comparisons?.length) {
    parts.push("## Historical comparisons");
    resp.comparisons.forEach((c, i) => parts.push("", ...renderComparison(c, i, resp.passages, resp.sources)));
  }
  if (resp.status === "partial" && resp.rated_cases?.length) {
    parts.push("## Rated cases (no written comparison available)");
    for (const rc of resp.rated_cases) {
      parts.push(`- **${esc(rc.case.title)}** (${rc.role}) — fit ${rc.rating.analogy_fit}/100, a rubric rating.`);
    }
  }
  if (resp.status === "partial" && resp.unranked_cases?.length) {
    parts.push("## Cases without a fit rating (ranking unavailable)");
    for (const k of resp.unranked_cases) parts.push(`- ${esc(k.title)} — ${esc(k.display_date)}`);
  }
  if (resp.challenging) {
    parts.push("", "## A challenging case", ...renderComparison(resp.challenging, 0, resp.passages, resp.sources));
  } else if (resp.challenging_note) {
    parts.push("", "## A challenging case", esc(resp.challenging_note));
  }
  if (resp.next_steps?.length) parts.push("", "## Next steps", ...resp.next_steps.map((s) => `- ${esc(s.text)}`));
  if (resp.what_would_change?.length) {
    parts.push("", "## What would change the advice");
    for (const w of resp.what_would_change) {
      const update = w.suggested_update ? ` (suggested update: ${esc(w.suggested_update.label)})` : "";
      parts.push(`- If ${esc(w.condition)}: ${esc(w.effect)}${update}`);
    }
  }
  if (resp.uncertainties?.length) parts.push("", "## Remaining uncertainties", ...resp.uncertainties.map((u) => `- ${esc(u)}`));
  if (resp.source_conflicts?.length) {
    parts.push("", "## Accounts differ");
    for (const c of resp.source_conflicts) parts.push(`- ${esc(c.summary)}`);
  }
  parts.push("", ...renderWarnings(resp.warnings));
  if (resp.status !== "partial" || resp.validation) parts.push("", ...renderValidation(resp.validation));
  parts.push("", ...renderSources(resp.sources), "", ...renderFooter(resp.versions, resp.mode, resp.sample, resp.request_id));
  return compact(parts);
}

/** Renders the fast evidence path: rated, outcome-free case views. */
export function renderEvidence(resp: EvidenceResponse): string {
  const parts: string[] = [];
  parts.push("## Decision profile", esc(resp.profile?.decision ?? resp.message));
  if (resp.profile?.options?.length) parts.push(`**Options:** ${resp.profile.options.map(esc).join(" · ")}`);
  if (resp.profile?.known_constraints?.length) {
    parts.push(`**Stated constraints:** ${resp.profile.known_constraints.map(esc).join("; ")}`);
  }
  parts.push("", esc(resp.message), "", "## Rated historical cases — outcomes withheld");
  resp.rated_cases.forEach((r, i) => {
    parts.push(
      "",
      `### ${i + 1}. ${esc(r.title)} — ${esc(r.display_date)} (${r.role})`,
      ...renderRating(r.rating),
      `**The decision:** ${esc(r.decision_question)}`,
      `**Situation at the time:** ${esc(r.pre_decision.situation)}`,
      `**Options on the table:** ${r.pre_decision.options.map(esc).join(" · ")}`,
    );
    if (r.pre_decision.actors?.length) parts.push(`**Actors:** ${r.pre_decision.actors.map(esc).join(", ")}`);
    if (r.pre_decision.goals?.length) parts.push(`**Goals:** ${r.pre_decision.goals.map(esc).join("; ")}`);
    if (r.pre_decision.incentives?.length) parts.push(`**Incentives:** ${r.pre_decision.incentives.map(esc).join("; ")}`);
    if (r.pre_decision.constraints?.length) parts.push(`**Constraints:** ${r.pre_decision.constraints.map(esc).join("; ")}`);
    if (r.mechanism_tags?.length) parts.push(`**Mechanism tags:** ${r.mechanism_tags.join(", ")}`);
    if (r.analogy_limits?.length) parts.push(`**Analogy limits:** ${r.analogy_limits.map(esc).join("; ")}`);
  });
  if (resp.challenging_note) parts.push("", esc(resp.challenging_note));
  parts.push(
    "",
    "## How to continue",
    "To write the comparison, call `get_historical_case` for the one or two most relevant cases (it returns the full story with outcomes, claims and sources), then write the comparison and conditional advice yourself following the skill's rules. For the fully validated written analysis instead, call `get_historical_advice` (takes up to ~60 seconds).",
  );
  parts.push("", ...renderWarnings(resp.warnings), "", ...renderFooter(resp.versions, resp.mode, resp.sample, resp.request_id));
  return compact(parts);
}

/** Renders one full case story. */
export function renderCase(detail: CaseDetailResponse): string {
  const k = detail.case;
  const lines = ["# " + esc(k.title) + " — " + esc(k.display_date), "", esc(k.date_detail), "", "## The decision", esc(k.decision_question), "", "## Situation before the decision", esc(k.context?.text ?? "")];
  if (k.mechanism_tags?.length) lines.push("", "**Mechanism tags:** " + k.mechanism_tags.join(", "));
  lines.push("", "## What happened", esc(k.chosen_action?.text ?? ""), "", esc(k.outcome?.text ?? ""));
  if (k.outcome?.uncertainty) lines.push(`*Outcome uncertainty: ${esc(k.outcome.uncertainty)}*`);
  if (k.lesson?.text) {
    lines.push("", "## The lesson (modern interpretation)", esc(k.lesson.text));
    for (const c of k.lesson.conditions ?? []) lines.push(`- ${esc(c)}`);
  }
  if (k.analogy_limits?.length) lines.push("", "## Limits of the comparison", ...k.analogy_limits.map((l) => `- ${esc(l)}`));
  if (k.disputes?.length) {
    lines.push("", "## Accounts differ");
    for (const d of k.disputes) {
      lines.push(`- ${esc(d.summary)}`);
      for (const p of d.positions ?? []) lines.push(`  - ${esc(p.attribution)}: ${esc(p.position)}`);
    }
  }
  if (detail.claims?.length) {
    lines.push("", "## Claims and supporting passages");
    for (const c of detail.claims) {
      const refs = c.passage_ids?.length ? ` [passages: ${c.passage_ids.join(", ")}]` : "";
      lines.push(`- (${esc(c.type)}) ${esc(c.statement)}${refs}`);
    }
  }
  lines.push("", ...renderSources(detail.sources), "", `*Corpus ${detail.corpus_version ?? "?"}*`);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
