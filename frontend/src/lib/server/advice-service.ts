import "server-only";
import { AdviceRequestSchema, type AdviceResponse, type ApiError, type ErrorCode, type EvidenceResponse, type ProgressStage } from "@/lib/contracts/advice";
import { loadConfig } from "@/lib/server/config";
import { CorpusError, getCaseRepository } from "@/lib/server/corpus";
import { runDemoPipeline } from "@/lib/server/pipeline/demo";
import { CancelledError, runLivePipeline } from "@/lib/server/pipeline/live";
import { DeadlineExceededError } from "@/lib/server/pipeline/runtime";
import { createLlmClient } from "@/lib/server/providers/llm";
import { createJevClient } from "@/lib/server/providers/jev";

export interface ServiceResult {
  httpStatus: number;
  body: AdviceResponse | EvidenceResponse | ApiError;
}

export interface ServiceOptions {
  requestId: string;
  signal?: AbortSignal;
  onProgress?: (stage: ProgressStage, message: string) => void;
}

const error = (requestId: string, httpStatus: number, code: ErrorCode, message: string, details?: string[]): ServiceResult => ({
  httpStatus,
  body: { request_id: requestId, error: { code, message, ...(details ? { details } : {}) } },
});

/** Shared error mapping for pipeline failures (also used by the evidence service). */
export function mapServiceError(requestId: string, err: unknown, signal?: AbortSignal): ServiceResult {
  if (err instanceof CorpusError) {
    console.error(JSON.stringify({ request_id: requestId, event: "corpus_error", message: err.message, issues: err.issues }));
    return error(requestId, 503, "corpus_unavailable", "The historical collection could not be loaded.");
  }
  if (err instanceof CancelledError || signal?.aborted) {
    return error(requestId, 499, "cancelled", "The request was cancelled.");
  }
  if (err instanceof DeadlineExceededError) {
    return error(requestId, 504, "deadline_exceeded", "The analysis took too long and was stopped. Please try again.");
  }
  console.error(JSON.stringify({ request_id: requestId, event: "internal_error", message: err instanceof Error ? err.message : String(err) }));
  return error(requestId, 500, "internal_error", "Something went wrong while preparing the analysis.");
}

/**
 * Transport-independent entry point for advice. HTTP handlers (and later an
 * MCP adapter) call this; it owns validation, mode selection and error mapping.
 */
export async function getAdvice(input: unknown, opts: ServiceOptions): Promise<ServiceResult> {
  const startedAt = Date.now();
  const parsed = AdviceRequestSchema.safeParse(input);
  if (!parsed.success) {
    return error(
      opts.requestId,
      400,
      "invalid_request",
      parsed.error.issues[0]?.message ?? "The request is not valid.",
      parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "body"}: ${i.message}`),
    );
  }
  const req = parsed.data;
  const config = loadConfig();
  const repo = getCaseRepository(config);

  let result: ServiceResult;
  let usage: Record<string, unknown> | undefined;
  try {
    if (config.mode === "demo") {
      result = { httpStatus: 200, body: await runDemoPipeline(req, repo, config, opts) };
    } else {
      const jev = createJevClient(config.jev);
      if (!jev) {
        return error(opts.requestId, 503, "provider_unconfigured", "Live mode is selected, but the OpenRouter API key is not configured on the server.");
      }
      const llm = createLlmClient(config.llm);
      try {
        result = { httpStatus: 200, body: await runLivePipeline(req, { repo, jev, llm, config }, opts) };
      } finally {
        usage = { billing: "openrouter", jev: jev.totals, llm: llm?.totals ?? null };
      }
    }
  } catch (err) {
    result = mapServiceError(opts.requestId, err, opts.signal);
  }

  // Log identifiers, versions and timings only, never the dilemma text.
  const body = result.body;
  console.info(
    JSON.stringify({
      request_id: opts.requestId,
      event: "advice",
      mode: config.mode,
      http_status: result.httpStatus,
      status: "status" in body ? body.status : body.error.code,
      versions: "versions" in body ? body.versions : undefined,
      usage,
      ms: Date.now() - startedAt,
    }),
  );
  return result;
}
