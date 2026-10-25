import "server-only";
import { AdviceRequestSchema, type AdviceResponse, type EvidenceResponse, type PartialResponse } from "@/lib/contracts/advice";
import { loadConfig } from "@/lib/server/config";
import { getCaseRepository, type CaseRepository } from "@/lib/server/corpus";
import { mapServiceError, type ServiceOptions, type ServiceResult } from "@/lib/server/advice-service";
import { runDemoPipeline } from "@/lib/server/pipeline/demo";
import { runLivePipeline } from "@/lib/server/pipeline/live";
import { createLlmClient } from "@/lib/server/providers/llm";
import { createJevClient } from "@/lib/server/providers/jev";

/**
 * Maps a rated partial (pipeline with skipSynthesis) to the outcome-free
 * evidence response. Only the pre-decision block Jev ranked on may leave the
 * server, so the host cannot write with hindsight. Exported for tests.
 */
export async function mapToEvidence(body: PartialResponse, repo: CaseRepository): Promise<EvidenceResponse> {
  const ids = body.rated_cases.map((r) => r.case.case_id);
  const bundles = new Map((await repo.getBundles(ids)).map((b) => [b.record.case_id, b]));
  return {
    kind: "evidence",
    request_id: body.request_id,
    mode: body.mode,
    sample: body.sample,
    versions: body.versions,
    profile: body.profile,
    warnings: body.warnings,
    timings_ms: body.timings_ms,
    status: "ready",
    message: body.message,
    rated_cases: body.rated_cases.map((r) => {
      const bundle = bundles.get(r.case.case_id)!;
      return {
        case_id: r.case.case_id,
        title: r.case.title,
        display_date: r.case.display_date,
        decision_question: r.case.decision_question,
        pre_decision: bundle.record.pre_decision,
        mechanism_tags: bundle.record.mechanism_tags,
        analogy_limits: bundle.record.analogy_limits,
        rating: r.rating,
        role: r.role,
      };
    }),
    challenging_note: body.challenging_note,
  };
}

/**
 * Fast evidence path for chatbot clients (docs/decisions.md §J): decision
 * profile, retrieval and Jev ranking, then rated OUTCOME-FREE case views.
 * Skips the writer and validation so the call stays well under chatbot tool
 * timeouts; the host synthesises the comparison under the skill's rules.
 */
export async function getEvidence(input: unknown, opts: ServiceOptions): Promise<ServiceResult> {
  const startedAt = Date.now();
  const parsed = AdviceRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      httpStatus: 400,
      body: {
        request_id: opts.requestId,
        error: {
          code: "invalid_request",
          message: parsed.error.issues[0]?.message ?? "The request is not valid.",
          details: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "body"}: ${i.message}`),
        },
      },
    };
  }
  const req = parsed.data;
  const config = loadConfig();
  const repo = getCaseRepository(config);

  let result: ServiceResult;
  try {
    if (config.mode === "demo") {
      // Preview mode has no providers; return the prewritten sample as-is.
      result = { httpStatus: 200, body: await runDemoPipeline(req, repo, config, opts) };
    } else {
      const jev = createJevClient(config.jev);
      if (!jev) {
        return {
          httpStatus: 503,
          body: {
            request_id: opts.requestId,
            error: { code: "provider_unconfigured", message: "Live mode is selected, but the OpenRouter API key is not configured on the server." },
          },
        };
      }
      const llm = createLlmClient(config.llm);
      result = { httpStatus: 200, body: await runLivePipeline(req, { repo, jev, llm, config }, { ...opts, skipSynthesis: true }) };
    }
  } catch (err) {
    result = mapServiceError(opts.requestId, err, opts.signal);
  }

  const body = result.body as AdviceResponse;
  if (
    result.httpStatus === 200 &&
    body.status === "partial" &&
    body.ranking_status === "ok" &&
    body.rated_cases.length
  ) {
    // Strip everything post-decision before anything leaves the server.
    result = { httpStatus: 200, body: await mapToEvidence(body, repo) };
  }

  console.info(
    JSON.stringify({
      request_id: opts.requestId,
      event: "evidence",
      mode: config.mode,
      http_status: result.httpStatus,
      status: "status" in result.body ? result.body.status : result.body.error.code,
      ms: Date.now() - startedAt,
    }),
  );
  return result;
}
