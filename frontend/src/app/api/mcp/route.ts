import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { AdviceRequestSchema, type AdviceResponse, type EvidenceResponse } from "@/lib/contracts/advice";
import { getAdvice } from "@/lib/server/advice-service";
import { getCaseDetail } from "@/lib/server/case-service";
import { getEvidence } from "@/lib/server/evidence-service";
import { renderAdvice, renderCase, renderEvidence } from "@/lib/server/mcp/render";

/**
 * Remote MCP endpoint for the chatbots (docs/decisions.md §B): one Streamable
 * HTTP route inside the Next.js app — the same deployment, corpus and
 * validation as the website. Stateless, so it runs on plain Vercel functions.
 *
 * Tools:
 *   get_historical_evidence — fast path (profile + Jev ranking, outcomes
 *     withheld); primary tool for chatbot clients because their tool calls
 *     are hard-capped around 60 s (docs/decisions.md §J).
 *   get_historical_case    — one full approved case story with sources.
 *   get_historical_advice  — the full validated pipeline (~40–60 s); only
 *     when the user explicitly wants the fully checked written analysis.
 *
 * No auth for the demo (docs/decisions.md §C); wrap with withMcpAuth later.
 */

// Covers the full-pipeline tool (the pipeline deadline is 180 s).
export const maxDuration = 200;

const requestId = (): string => `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

const textResult = (markdown: string, json: unknown, isError = false) => ({
  content: [
    { type: "text" as const, text: markdown },
    { type: "text" as const, text: `Structured response (reference only — present the markdown above, not this JSON):\n${JSON.stringify(json)}` },
  ],
  isError,
});

const failedResult = (message: string) => ({
  content: [
    {
      type: "text" as const,
      text: `${message} Tell the user the call failed; do not fabricate historical comparisons, quotes, or advice.`,
    },
  ],
  isError: true,
});

/** Evidence responses carry `kind: "evidence"`; anything else renders as advice. */
const isEvidence = (body: unknown): body is EvidenceResponse =>
  typeof body === "object" && body !== null && (body as { kind?: unknown }).kind === "evidence";

const handler = createMcpHandler((server) => {
  server.registerTool(
    "get_historical_evidence",
    {
      description:
        "Rank historical decision cases for a present-day dilemma WITHOUT revealing outcomes: the decision profile plus Jev-rated, outcome-free case views (fit ratings, situation, options, constraints, mechanism tags, analogy limits). Fast (about 10–20 seconds) — this is the default tool for chatbot use. " +
        "After choosing one or two relevant cases, call get_historical_case for their full stories, then write the comparison and conditional advice yourself following the skill's rules. " +
        "Follow-ups are stateless: if the user changes a constraint, re-send the FULL dilemma with the changed constraint. " +
        "If the result asks for a clarification, relay the question and call again with the same query plus clarifications. " +
        "The analogy-fit number is a rubric rating, not a probability.",
      inputSchema: AdviceRequestSchema,
    },
    async (args) => {
      try {
        const result = await getEvidence(args, { requestId: requestId() });
        const body = result.body as AdviceResponse | EvidenceResponse;
        const markdown = isEvidence(body) ? renderEvidence(body) : renderAdvice(body);
        return textResult(markdown, body);
      } catch (err) {
        return failedResult(`The evidence call failed (${err instanceof Error ? err.message : String(err)}).`);
      }
    },
  );

  server.registerTool(
    "get_historical_case",
    {
      description:
        "The full story of one approved historical decision case: the situation before the decision, the options, what happened and the outcome, the lesson, disputed accounts, and every claim with its exact passages and sources. Use for the one or two cases selected from get_historical_evidence, or when the user asks about a specific case.",
      inputSchema: z.strictObject({
        case_id: z.string().trim().min(1).max(80).describe("The case ID from a previous tool result (for example C29)."),
      }),
    },
    async ({ case_id }) => {
      try {
        const detail = await getCaseDetail(case_id);
        if (!detail) return failedResult(`No approved case has the ID "${case_id}".`);
        return textResult(renderCase(detail), detail);
      } catch (err) {
        return failedResult(`The case call failed (${err instanceof Error ? err.message : String(err)}).`);
      }
    },
  );

  server.registerTool(
    "get_historical_advice",
    {
      description:
        "The FULL validated pipeline: decision profile, historical comparisons with fit ratings and exact source passages, a conditional recommendation, next steps, and what would change the advice — every historical claim checked against its sources. " +
        "Takes up to ~60 seconds, which risks the client's tool timeout; prefer get_historical_evidence for interactive use, and call this only when the user explicitly wants the fully validated written analysis. " +
        "Present the returned markdown mostly as-is; the analogy-fit number is a rubric rating, not a probability.",
      inputSchema: AdviceRequestSchema,
    },
    async (args) => {
      try {
        const result = await getAdvice(args, { requestId: requestId() });
        const body = result.body as AdviceResponse;
        if (result.httpStatus !== 200) {
          const apiError = body as { error?: { code?: string; message?: string } };
          return failedResult(`The backend answered with ${apiError.error?.code ?? result.httpStatus}: ${apiError.error?.message ?? ""}.`);
        }
        return textResult(renderAdvice(body), body);
      } catch (err) {
        return failedResult(`The advice call failed (${err instanceof Error ? err.message : String(err)}).`);
      }
    },
  );
}, { serverInfo: { name: "historical-figure", version: "0.1.0" } });

export { handler as GET, handler as POST };
