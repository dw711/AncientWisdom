import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { AdviceRequestSchema, type ApiError } from "@/lib/contracts/advice";
import { getAdvice } from "@/lib/server/advice-service";
import { getCaseDetail } from "@/lib/server/case-service";
import { loadConfig } from "@/lib/server/config";
import { rateLimit } from "@/lib/server/rate-limit";
import { renderAdvice, renderCase } from "./render";

/**
 * The remote MCP surface (design §8.2) for hosts that cannot spawn a local stdio
 * server, i.e. ChatGPT. Same two read-only tools and descriptions as mcp/index.mjs,
 * but calling the service layer in-process instead of over HTTP.
 */

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;

const newRequestId = () => `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

function errorResult(body: ApiError): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: `The Historical Figure backend call failed: ${body.error.code}: ${body.error.message.replace(/\.$/, "")}. Tell the user the call failed; do not fabricate historical comparisons, quotes, or advice.`,
      },
    ],
    isError: true,
  };
}

function okResult(markdown: string, structured: object): CallToolResult {
  // The model reads `content`; `structuredContent` carries the full response for
  // hosts and widgets that want it.
  return { content: [{ type: "text", text: markdown }], structuredContent: structured as Record<string, unknown> };
}

export function createMcpServer({ client, signal }: { client: string; signal?: AbortSignal }): McpServer {
  const server = new McpServer({ name: "historical-figure", title: "Historical Figure · 以古为鉴", version: "0.1.0" });

  server.registerTool(
    "get_historical_advice",
    {
      title: "Get historical advice for a decision",
      description:
        "Run the full validated pipeline for a present-day dilemma: a decision profile, ranked historical decision cases with fit ratings and exact source passages, a conditional recommendation, next steps, and what would change the advice. Takes up to ~60 seconds — call it once and wait. " +
        "Follow-ups are stateless: if the user changes a constraint, re-send the FULL dilemma with the changed constraint in the same call. " +
        "If the result asks for a clarification, relay the question to the user and call again with the same query plus clarifications. " +
        "Present the returned markdown mostly as-is; the analogy-fit number is a rubric rating, not a probability.",
      inputSchema: AdviceRequestSchema,
      annotations: READ_ONLY,
    },
    async (args) => {
      const requestId = newRequestId();
      const config = loadConfig();
      const max = config.mode === "demo" ? config.rateLimit.max * 5 : config.rateLimit.max;
      const limit = rateLimit(`advice:${client}`, max, config.rateLimit.windowMs);
      if (!limit.ok) {
        return errorResult({
          request_id: requestId,
          error: { code: "rate_limited", message: `Too many requests. Try again in ${limit.retryAfterSeconds} seconds.` },
        });
      }
      const result = await getAdvice(args, { requestId, signal });
      return "error" in result.body ? errorResult(result.body) : okResult(renderAdvice(result.body), result.body);
    },
  );

  server.registerTool(
    "get_historical_case",
    {
      title: "Read a historical decision case",
      description:
        "The full story of one approved historical decision case: the situation before the decision, options, what happened, the lesson, disputed accounts, and every claim with its exact passages and sources. Use when the user asks about a specific case from a previous answer, or wants to read the full story.",
      inputSchema: z.strictObject({ case_id: z.string().trim().min(1).max(80) }),
      annotations: { ...READ_ONLY, idempotentHint: true },
    },
    async ({ case_id }) => {
      const result = await getCaseDetail(case_id, newRequestId());
      return "error" in result.body ? errorResult(result.body) : okResult(renderCase(result.body), result.body);
    },
  );

  return server;
}
