import type {
  AdviceResponse,
  CaseDetailResponse,
  Comparison,
  PartialResponse,
  PassageView,
  ReadyResponse,
  SourceView,
  ValidationReport,
} from "@/lib/contracts/advice";

/**
 * Markdown for assistant hosts (docs/decisions.md §I, ported from mcp/index.mjs on
 * assistant-integration). Assistants present this mostly as-is, which keeps quotes
 * and source links out of the host's rewriting. Every fact comes from the validated
 * response; the renderer adds no historical content of its own.
 */

const esc = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
/**
 * Conditions arrive as "If you can…" or as full sentences ("You have tested….");
 * render both as one "If …" clause. Only common sentence-opening words are
 * lowercased, so names and acronyms keep their case.
 */
const ifClause = (s: string) =>
  `If ${esc(s)
    .replace(/^if\s+/i, "")
    .replace(/\.$/, "")
    .replace(/^(You|Your|We|Our|The|A|An|It|There|They|This|That)\b/, (w) => w.toLowerCase())}`;

function renderSources(sources: SourceView[]): string[] {
  if (!sources.length) return [];
  return [
    "## Sources",
    ...sources.map((s, i) => {
      const by = s.author ? ` — ${esc(s.author)}` : ` — ${esc(s.institution)}`;
      const archived = s.archived_url ? ` ([archived copy](${s.archived_url}))` : "";
      return `${i + 1}. [${esc(s.title)}](${s.url})${by}${archived}`;
    }),
  ];
}

function renderQuote(q: { passage_id: string; text: string }, passages: PassageView[], sources: SourceView[]): string[] {
  const p = passages.find((x) => x.passage_id === q.passage_id);
  const s = p ? sources.find((x) => x.source_id === p.source_id) : undefined;
  const from = s ? `— ${esc(s.title)}${p?.locator ? `, ${esc(p.locator)}` : ""}` : `— passage ${q.passage_id}`;
  return [`> ${esc(q.text)}`, `> ${from}`];
}

function renderComparison(c: Comparison, i: number, resp: AdviceResponse): string[] {
  const lines = [`### ${i + 1}. ${esc(c.case.title)} — ${esc(c.case.display_date)} (${c.role})`];
  const sample = c.rating.source === "sample" ? " (illustrative sample rating)" : "";
  lines.push(`**Analogy fit: ${c.rating.analogy_fit}/100** — a rubric rating, not a probability${sample}.`);
  if (!c.rating.eligible && c.rating.ineligible_reasons.length) {
    lines.push(`*Shown despite eligibility gates:* ${c.rating.ineligible_reasons.map(esc).join("; ")}.`);
  }
  if (c.shared_mechanism) lines.push(`**Shared mechanism:** ${esc(c.shared_mechanism)}`);
  if (c.lesson) lines.push(`**Lesson for your decision:** ${esc(c.lesson)}`);
  if (c.applies_when) lines.push(`**Applies when:** ${esc(c.applies_when)}`);
  if (c.important_differences.length) {
    lines.push("**Important differences:**", ...c.important_differences.map((d) => `- ${esc(d)}`));
  }
  if (c.historical_points.length) {
    lines.push("**Historical points:**", ...c.historical_points.map((p) => `- ${esc(p.text)}`));
  }
  if (c.quotes.length) {
    lines.push("**From the sources:**");
    for (const q of c.quotes) lines.push(...renderQuote(q, resp.passages, resp.sources), "");
  }
  return lines;
}

function renderValidation(v: ValidationReport | null): string[] {
  if (!v) return [];
  const names = {
    schema: "Schema",
    evidence_ids: "Evidence IDs",
    quotations: "Exact quotations",
    claim_support: "Claim support",
    consistency: "Consistency",
  } as const;
  const lines = ["## How this answer was checked"];
  for (const [key, label] of Object.entries(names)) lines.push(`- **${label}:** ${v[key as keyof typeof names]}`);
  for (const r of v.removed) lines.push(`- **Removed:** ${esc(r.item)} — ${esc(r.reason)}`);
  return lines;
}

function renderBody(resp: ReadyResponse | PartialResponse): string[] {
  const parts: string[] = [];
  if (resp.decision_summary) parts.push("## The decision", esc(resp.decision_summary), "");

  const r = resp.recommendation;
  if (r) {
    parts.push("## Recommendation", esc(r.text));
    if (r.conditions.length) parts.push("**Conditions:**", ...r.conditions.map((c) => `- ${esc(c)}`));
    if (resp.alternatives.length) {
      parts.push("**Conditional alternatives:**", ...resp.alternatives.map((a) => `- ${ifClause(a.condition)}: ${esc(a.action)}`));
    }
    if (resp.lesson_tension) parts.push(`**Tension between the cases:** ${esc(resp.lesson_tension)}`);
    parts.push("");
  }

  if (resp.comparisons.length) {
    parts.push("## Historical comparisons");
    resp.comparisons.forEach((c, i) => parts.push("", ...renderComparison(c, i, resp)));
  }
  if (resp.status === "partial") {
    if (resp.rated_cases.length) {
      parts.push("## Rated cases (writer unavailable — no written comparison)");
      for (const rc of resp.rated_cases) {
        parts.push(`- **${esc(rc.case.title)}** (${rc.role}) — fit ${rc.rating.analogy_fit}/100, a rubric rating.`);
      }
    }
    if (resp.unranked_cases.length) {
      parts.push("## Cases without a fit rating (ranking unavailable)");
      for (const k of resp.unranked_cases) parts.push(`- ${esc(k.title)} — ${esc(k.display_date)}`);
    }
  }

  if (resp.challenging) parts.push("", "## A challenging case", ...renderComparison(resp.challenging, 0, resp));
  else if (resp.challenging_note) parts.push("", "## A challenging case", esc(resp.challenging_note));

  if (resp.next_steps.length) parts.push("", "## Next steps", ...resp.next_steps.map((s) => `- ${esc(s.text)}`));
  if (resp.what_would_change.length) {
    parts.push("", "## What would change the advice");
    for (const w of resp.what_would_change) {
      const update = w.suggested_update ? ` (suggested update: ${esc(w.suggested_update.label)})` : "";
      parts.push(`- ${ifClause(w.condition)}: ${esc(w.effect)}${update}`);
    }
  }
  if (resp.uncertainties.length) parts.push("", "## Remaining uncertainties", ...resp.uncertainties.map((u) => `- ${esc(u)}`));
  if (resp.source_conflicts.length) parts.push("", "## Accounts differ", ...resp.source_conflicts.map((c) => `- ${esc(c.summary)}`));
  parts.push("", ...renderValidation(resp.validation));
  return parts;
}

const finish = (lines: string[]) => lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";

export function renderAdvice(resp: AdviceResponse): string {
  if (resp.status === "needs_clarification") {
    return finish([
      "## One clarification is needed before answering",
      ...resp.questions.map((q) => `- **${esc(q.question)}** *(why it matters: ${esc(q.why_it_matters)})*`),
      "",
      "Ask the user this question, then call get_historical_advice again with the same query plus",
      '`clarifications: [{ "question": "<the exact question text>", "answer": "<the user\'s answer>" }]`.',
    ]);
  }

  if (resp.status === "insufficient_evidence") {
    const parts = ["## No sufficiently relevant historical case", esc(resp.message)];
    if (resp.near_misses.length) {
      parts.push("**Nearest cases (not strong enough to draw a lesson from):**");
      for (const n of resp.near_misses) {
        const fit = n.analogy_fit != null ? ` (fit ${n.analogy_fit}/100)` : "";
        parts.push(`- ${esc(n.title)}${fit}${n.reasons.length ? ` — ${n.reasons.map(esc).join("; ")}` : ""}`);
      }
    }
    if (resp.suggestions.length) parts.push("**Suggestions:**", ...resp.suggestions.map((s) => `- ${esc(s)}`));
    parts.push("Report this honestly to the user; do not invent a comparison.");
    return finish(parts);
  }

  const parts: string[] = [];
  if (resp.status === "partial") {
    parts.push("## Partial answer", esc(resp.message), ...resp.missing.map((m) => `- Missing ${m.part}: ${esc(m.reason)}`), "");
  }
  if (resp.sample) parts.push("**Note:** this is a prewritten sample analysis (preview mode), not a live analysis.", "");

  const p = resp.profile;
  if (p) {
    parts.push("## Your decision as understood", `**Decision:** ${esc(p.decision)}`);
    if (p.options.length) parts.push(`**Options:** ${p.options.map(esc).join(" · ")}`);
    if (p.known_constraints.length) parts.push(`**Stated constraints:** ${p.known_constraints.map(esc).join("; ")}`);
    if (p.uncertainties.length) parts.push(`**Unknowns:** ${p.uncertainties.map(esc).join("; ")}`);
    if (p.assumptions.length) parts.push(`**Assumptions (not yet stated as facts):** ${p.assumptions.map(esc).join("; ")}`);
    parts.push("");
  }

  parts.push(...renderBody(resp));
  if (resp.warnings.length) parts.push("", "## Warnings", ...resp.warnings.map((w) => `- ${esc(w)}`));
  const v = resp.versions;
  const footer = [`corpus ${v.corpus}`, `rubric ${v.rubric}`, `${resp.mode} mode`, ...(resp.sample ? ["sample analysis"] : [])];
  parts.push("", ...renderSources(resp.sources), "", `*${footer.join(" · ")} · request ${resp.request_id}*`);
  return finish(parts);
}

export function renderCase(detail: CaseDetailResponse): string {
  const k = detail.case;
  const lines = [
    `# ${esc(k.title)} — ${esc(k.display_date)}`,
    "",
    esc(k.date_detail),
    "",
    "## The decision",
    esc(k.decision_question),
    "",
    "## Situation before the decision",
    esc(k.context.text),
    "",
    "## What happened",
    esc(k.chosen_action.text),
    "",
    esc(k.outcome.text),
  ];
  if (k.outcome.uncertainty) lines.push(`*Outcome uncertainty: ${esc(k.outcome.uncertainty)}*`);
  if (k.lesson.text) {
    lines.push("", "## The lesson (modern interpretation)", esc(k.lesson.text), ...k.lesson.conditions.map((c) => `- ${esc(c)}`));
  }
  if (k.analogy_limits.length) lines.push("", "## Limits of the comparison", ...k.analogy_limits.map((l) => `- ${esc(l)}`));
  if (k.disputes.length) {
    lines.push("", "## Accounts differ");
    for (const d of k.disputes) {
      lines.push(`- ${esc(d.summary)}`, ...d.positions.map((p) => `  - ${esc(p.attribution)}: ${esc(p.position)}`));
    }
  }
  if (detail.claims.length) {
    lines.push("", "## Claims and supporting passages");
    for (const c of detail.claims) {
      const refs = c.passage_ids.length ? ` [passages: ${c.passage_ids.join(", ")}]` : "";
      lines.push(`- (${esc(c.type)}) ${esc(c.statement)}${refs}`);
    }
  }
  lines.push("", ...renderSources(detail.sources), "", `*Corpus ${detail.corpus_version}*`);
  return finish(lines);
}
