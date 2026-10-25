import "server-only";
import type { CaseBundle } from "@/lib/server/corpus/repository";
import type { JevClient, JevQuestion } from "@/lib/server/providers/jev";
import type { Deadline } from "@/lib/server/pipeline/runtime";
import type { WriterOutput } from "@/lib/server/synthesis/schema";
import type { Issue } from "./checks";

export interface PointSupport {
  path: string;
  verdict: "supports" | "contradicts" | "says_nothing";
  confidence: number;
}

export interface SemanticResult {
  support: Map<string, PointSupport>;
  contradictionProbability: number | null;
  issues: Issue[];
}

/**
 * Model-based checks using Jev: does each historical point's cited evidence
 * support it (the documented citation-check pattern), and do any two pieces of
 * advice conflict under the same conditions? These are additional model
 * judgements that reduce risk; they do not establish truth.
 */
export async function semanticChecks(args: {
  draft: WriterOutput;
  bundles: Map<string, CaseBundle>;
  jev: JevClient;
  deadline: Deadline;
  supportConfidence: number;
  contradictionThreshold: number;
}): Promise<SemanticResult> {
  const passages: Record<string, string> = {};
  const points: { point_id: string; path: string; case_id: string; text: string; cited_passage_ids: string[] }[] = [];

  args.draft.comparisons.forEach((c, i) => {
    const bundle = args.bundles.get(c.case_id);
    if (!bundle) return;
    const claims = new Map(bundle.claims.map((cl) => [cl.claim_id, cl]));
    const passageText = new Map(bundle.passages.map((p) => [p.passage_id, p.text]));
    c.historical_points.forEach((p, j) => {
      const cited = [...new Set(p.claim_ids.flatMap((id) => claims.get(id)?.supporting_passage_ids ?? []))];
      if (!cited.length) return;
      for (const pid of cited) passages[pid] = passageText.get(pid) ?? "";
      points.push({ point_id: `pt_${i}_${j}`, path: `comparisons[${i}].historical_points[${j}]`, case_id: c.case_id, text: p.text, cited_passage_ids: cited });
    });
  });

  const questions: Record<string, JevQuestion> = {};
  for (const p of points) {
    questions[p.point_id] = {
      type: "choice",
      instructions: {
        task: "How do the cited source passages relate to this historical statement?",
        statement_id: p.point_id,
        statement: p.text,
        cited_passage_ids: p.cited_passage_ids,
        note: "Read only the passages in state.passages whose IDs are listed in cited_passage_ids.",
      },
      criteria: {
        supports: "The cited passages state the statement or directly imply that it is true.",
        contradicts: "The cited passages state the opposite of the statement or imply that it is false.",
        says_nothing: "The cited passages do not address what the statement asserts, either way.",
      },
    };
  }
  questions.advice_contradiction = {
    type: "noul",
    instructions: "Do any two pieces of advice in state.advice tell the person to take incompatible actions under the same conditions?",
    criteria: {
      true: "At least two items recommend incompatible actions without a distinguishing condition.",
      false: "Every pair of items is compatible, or the items that differ apply under clearly different conditions.",
    },
  };

  const response = await args.jev.ask(
    {
      passages,
      statements: points.map(({ point_id, case_id, text, cited_passage_ids }) => ({ point_id, case_id, text, cited_passage_ids })),
      advice: {
        recommendation: args.draft.recommendation.text,
        recommendation_conditions: args.draft.recommendation.conditions,
        conditional_alternatives: args.draft.conditional_alternatives.map((a) => ({ if: a.condition, then: a.action })),
        next_steps: args.draft.next_steps.map((s) => s.text),
      },
    },
    questions,
    { signal: args.deadline.signal, deadlineMs: args.deadline.remainingMs() },
  );

  const support = new Map<string, PointSupport>();
  const issues: Issue[] = [];
  for (const p of points) {
    const answer = response.answers[p.point_id];
    if (answer?.type !== "choice") continue;
    const verdict = answer.choice as PointSupport["verdict"];
    support.set(p.path, { path: p.path, verdict, confidence: answer.confidence });
    if (verdict !== "supports" || answer.confidence < args.supportConfidence) {
      issues.push({
        code: "unsupported_point",
        path: p.path,
        message: `The cited passages ${verdict === "contradicts" ? "contradict" : "do not clearly support"} the statement "${p.text.slice(0, 120)}" for ${p.case_id}.`,
      });
    }
  }
  const contradiction = response.answers.advice_contradiction;
  const contradictionProbability = contradiction?.type === "noul" ? contradiction.noul : null;
  if (contradictionProbability !== null && contradictionProbability >= args.contradictionThreshold) {
    issues.push({ code: "contradiction", path: "conditional_alternatives", message: "Some of the advice appears to recommend incompatible actions under the same conditions." });
  }
  return { support, contradictionProbability, issues };
}
