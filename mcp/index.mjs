#!/usr/bin/env node
/**
 * Local stdio MCP server for Historical Figure.
 *
 * Decisions this follows (docs/decisions.md):
 *   B  One thin stdio wrapper over the single Next.js backend — no second service.
 *   I  Each tool returns the validated structured response PLUS a server-rendered
 *      markdown block that the host presents mostly as-is (protects quotes and
 *      evidence links from host rewriting).
 *   G  Clarification is owned by the backend; the skill relays the question.
 *   H  Follow-ups are stateless: the host re-sends the full dilemma.
 *   C  No auth for the demo; HF_API_TOKEN is optional future hardening.
 *
 * Tools: get_historical_advice, get_historical_case (read-only).
 * API:   POST /api/advice, GET /api/cases/:id (frontend/src/lib/contracts/advice.ts).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Mirrors frontend/src/lib/contracts/advice.ts (AdviceRequestSchema) so the
// tool contract and the HTTP contract cannot drift.
const ClarificationAnswerSchema = z.strictObject({
  question: z.string().trim().min(1).max(400),
  answer: z.string().trim().min(1).max(500),
});
const ExplicitConstraintsSchema = z.strictObject({
  deadline_hours: z.number().min(0).max(8760).optional(),
  reversibility: z.enum(["reversible", "partly_reversible", "irreversible", "unknown"]).optional(),
  rollback_tested: z.boolean().optional(),
  stakes: z.enum(["low", "medium", "high"]).optional(),
  relationship: z.enum(["one_off", "repeated", "unknown"]).optional(),
  notes: z.string().trim().max(600).optional(),
});
const AdviceArgsSchema = z.strictObject({
  query: z.string().trim().min(20).max(4000),
  language: z.enum(["en", "zh"]).default("en"),
  max_cases: z.number().int().min(1).max(3).default(3),
  constraints: ExplicitConstraintsSchema.default({}),
  clarifications: z.array(ClarificationAnswerSchema).max(2).default([]),
});
const CaseArgsSchema = z.strictObject({
  case_id: z.string().trim().min(1),
});

const API_BASE = (process.env.HF_API_BASE ?? "http://localhost:3000").replace(/\/+$/, "");
const API_TOKEN = process.env.HF_API_TOKEN ?? "";
const TIMEOUT_MS = Number(process.env.HF_TIMEOUT_MS ?? 200_000);

// ---------------------------------------------------------------------------
// HTTP proxy
// ---------------------------------------------------------------------------

async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(API_TOKEN ? { authorization: `Bearer ${API_TOKEN}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(
      `Could not reach the Historical Figure backend at ${API_BASE} (${err.message}). ` +
        `Is the app running, or is HF_API_BASE set correctly?`
    );
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON body; fall through to the HTTP error below.
  }
  if (!res.ok) {
    const err = data?.error;
    throw new Error(err ? `${err.code}: ${err.message}` : `HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Markdown rendering (decision I). Quotes and facts come from the validated
// response only; this renderer never adds historical content of its own.
// ---------------------------------------------------------------------------

const esc = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

function renderSources(resp) {
  if (!resp.sources?.length) return [];
  const lines = ["## Sources"];
  resp.sources.forEach((s, i) => {
    const archived = s.archived_url ? ` ([archived copy](${s.archived_url}))` : "";
    const by = s.author ? ` — ${esc(s.author)}` : ` — ${esc(s.institution)}`;
    lines.push(`${i + 1}. [${esc(s.title)}](${s.url})${by}${archived}`);
  });
  return lines;
}

function renderQuote(q, passages, sources) {
  const p = passages.find((x) => x.passage_id === q.passage_id);
  const s = p ? sources.find((x) => x.source_id === p.source_id) : null;
  const from = s ? `— ${esc(s.title)}${p?.locator ? `, ${esc(p.locator)}` : ""}` : `— passage ${q.passage_id}`;
  return [`> ${esc(q.text)}`, `> ${from}`];
}

function renderComparison(c, i, resp) {
  const k = c.case;
  const rating = c.rating;
  const lines = [`### ${i + 1}. ${esc(k.title)} — ${esc(k.display_date)} (${c.role})`];
  if (rating) {
    const sample = rating.source === "sample" ? " (illustrative sample rating)" : "";
    lines.push(`**Analogy fit: ${rating.analogy_fit}/100** — a rubric rating, not a probability${sample}.`);
    if (!rating.eligible && rating.ineligible_reasons?.length) {
      lines.push(`*Shown despite eligibility gates:* ${rating.ineligible_reasons.map(esc).join("; ")}.`);
    }
  }
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
    for (const q of c.quotes) lines.push(...renderQuote(q, resp.passages, resp.sources), "");
  }
  return lines;
}

function renderRecommendation(resp) {
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

function renderValidation(v) {
  if (!v) return [];
  const names = {
    schema: "Schema",
    evidence_ids: "Evidence IDs",
    quotations: "Exact quotations",
    claim_support: "Claim support",
    consistency: "Consistency",
  };
  const lines = ["## How this answer was checked"];
  for (const [key, label] of Object.entries(names)) {
    lines.push(`- **${label}:** ${v[key] ?? "n/a"}`);
  }
  for (const r of v.removed ?? []) lines.push(`- **Removed:** ${esc(r.item)} — ${esc(r.reason)}`);
  return lines;
}

function renderFooter(resp) {
  const v = resp.versions ?? {};
  const bits = [`corpus ${v.corpus ?? "?"}`, `rubric ${v.rubric ?? "?"}`, `${resp.mode ?? "?"} mode`];
  if (resp.sample) bits.push("sample analysis");
  return [`*${bits.join(" · ")} · request ${resp.request_id ?? "?"}*`];
}

function renderWarnings(resp) {
  if (!resp.warnings?.length) return [];
  return ["## Warnings", ...resp.warnings.map((w) => `- ${esc(w)}`)];
}

function renderProfile(resp) {
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

export function renderAdvice(resp) {
  const parts = [];

  if (resp.status === "needs_clarification") {
    parts.push(
      `## One clarification is needed before answering`,
      ...(resp.questions ?? []).map(
        (q) => `- **${esc(q.question)}** *(why it matters: ${esc(q.why_it_matters)})*`
      ),
      "",
      "Ask the user this question, then call get_historical_advice again with the same query plus",
      '`clarifications: [{ "question": "<the exact question text>", "answer": "<the user\'s answer>" }]`.'
    );
    return parts.join("\n");
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
    return parts.join("\n");
  }

  const partial = resp.status === "partial";
  if (partial) {
    parts.push("## Partial answer", esc(resp.message));
    for (const m of resp.missing ?? []) parts.push(`- Missing ${m.part}: ${esc(m.reason)}`);
    parts.push("");
  }

  if (resp.sample) {
    parts.push("**Note:** this is a prewritten sample analysis (preview mode), not a live analysis.");
  }

  if (resp.profile) parts.push(...renderProfile(resp), "");
  if (partial && resp.decision_summary) parts.push("## The decision", esc(resp.decision_summary), "");
  if (!partial && resp.decision_summary) parts.push("## The decision", esc(resp.decision_summary), "");
  parts.push(...renderRecommendation(resp), "");

  if (resp.comparisons?.length) {
    parts.push("## Historical comparisons");
    resp.comparisons.forEach((c, i) => parts.push("", ...renderComparison(c, i, resp)));
  }
  if (resp.rated_cases?.length) {
    parts.push("## Rated cases (writer unavailable — no written comparison)");
    for (const rc of resp.rated_cases) {
      parts.push(
        `- **${esc(rc.case.title)}** (${rc.role}) — fit ${rc.rating.analogy_fit}/100, a rubric rating.`
      );
    }
  }
  if (resp.unranked_cases?.length) {
    parts.push("## Cases without a fit rating (ranking unavailable)");
    for (const k of resp.unranked_cases) parts.push(`- ${esc(k.title)} — ${esc(k.display_date)}`);
  }

  if (resp.challenging) {
    parts.push("", "## A challenging case", ...renderComparison(resp.challenging, 0, resp));
  } else if (resp.challenging_note) {
    parts.push("", "## A challenging case", esc(resp.challenging_note));
  }

  if (resp.next_steps?.length) {
    parts.push("", "## Next steps", ...resp.next_steps.map((s) => `- ${esc(s.text)}`));
  }
  if (resp.what_would_change?.length) {
    parts.push("", "## What would change the advice");
    for (const w of resp.what_would_change) {
      const update = w.suggested_update ? ` (suggested update: ${esc(w.suggested_update.label)})` : "";
      parts.push(`- If ${esc(w.condition)}: ${esc(w.effect)}${update}`);
    }
  }
  if (resp.uncertainties?.length) {
    parts.push("", "## Remaining uncertainties", ...resp.uncertainties.map((u) => `- ${esc(u)}`));
  }
  if (resp.source_conflicts?.length) {
    parts.push("", "## Accounts differ");
    for (const c of resp.source_conflicts) parts.push(`- ${esc(c.summary)}`);
  }

  parts.push("", ...renderWarnings(resp));
  if (!partial || resp.validation) parts.push("", ...renderValidation(resp.validation));
  parts.push("", ...renderSources(resp), "", ...renderFooter(resp));
  return parts.filter((l) => l !== "" || true).join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export function renderCase(detail) {
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
    esc(k.context?.text ?? ""),
  ];
  if (k.actors?.length) lines.push("", "**Actors:** " + k.actors.map(esc).join(", "));
  if (k.goals?.length) lines.push("**Goals:** " + k.goals.map(esc).join("; "));
  if (k.constraints?.length) lines.push("**Constraints:** " + k.constraints.map(esc).join("; "));
  if (k.options?.length) lines.push("**Options on the table:** " + k.options.map(esc).join(" · "));
  lines.push("", "## What happened", esc(k.chosen_action?.text ?? ""), "", esc(k.outcome?.text ?? ""));
  if (k.outcome?.uncertainty) lines.push(`*Outcome uncertainty: ${esc(k.outcome.uncertainty)}*`);
  if (k.lesson?.text) {
    lines.push("", "## The lesson (modern interpretation)", esc(k.lesson.text));
    for (const c of k.lesson.conditions ?? []) lines.push(`- ${esc(c)}`);
  }
  if (k.analogy_limits?.length) {
    lines.push("", "## Limits of the comparison", ...k.analogy_limits.map((l) => `- ${esc(l)}`));
  }
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
  lines.push("", ...renderSources(detail), "", `*Corpus ${detail.corpus_version ?? "?"}*`);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const toolResult = (markdown, json, isError = false) => ({
  content: [
    { type: "text", text: markdown },
    ...(json
      ? [{ type: "text", text: `Structured response (reference only — present the markdown above, not this JSON):\n${JSON.stringify(json)}` }]
      : []),
  ],
  isError,
});

const errorResult = (err) => ({
  content: [
    {
      type: "text",
      text: `The Historical Figure backend call failed: ${err.message}. Tell the user the call failed; do not fabricate historical comparisons, quotes, or advice.`,
    },
  ],
  isError: true,
});

const server = new McpServer({ name: "historical-figure", version: "0.1.0" });

server.registerTool(
  "get_historical_advice",
  {
    title: "Get historical advice for a decision",
    description:
      "Run the full validated pipeline for a present-day dilemma: a decision profile, ranked historical decision cases with fit ratings and exact source passages, a conditional recommendation, next steps, and what would change the advice. Takes up to ~60 seconds — call it once and wait. " +
      "Follow-ups are stateless: if the user changes a constraint, re-send the FULL dilemma with the changed constraint in the same call. " +
      "If the result asks for a clarification, relay the question to the user and call again with the same query plus clarifications. " +
      "Present the returned markdown mostly as-is; the analogy-fit number is a rubric rating, not a probability.",
    inputSchema: AdviceArgsSchema,
  },
  async (args) => {
    try {
      const resp = await api("/api/advice", { method: "POST", body: args });
      return toolResult(renderAdvice(resp), resp);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "get_historical_case",
  {
    title: "Read a historical decision case",
    description:
      "The full story of one approved historical decision case: the situation before the decision, options, what happened, the lesson, disputed accounts, and every claim with its exact passages and sources. Use when the user asks about a specific case from a previous answer, or wants to read the full story.",
    inputSchema: CaseArgsSchema,
  },
  async (args) => {
    try {
      const detail = await api(`/api/cases/${encodeURIComponent(args.case_id)}`);
      return toolResult(renderCase(detail), detail);
    } catch (err) {
      return errorResult(err);
    }
  }
);

// Only connect when run directly, so the renderers stay importable in tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`historical-figure MCP server ready, API base ${API_BASE}`);
}
