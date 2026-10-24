import "server-only";
import type { ApiError, CaseDetailResponse } from "@/lib/contracts/advice";
import { CorpusError, getCaseRepository } from "@/lib/server/corpus";
import { evidenceViews, toCaseCard } from "@/lib/server/corpus/views";

export interface CaseResult {
  httpStatus: number;
  body: CaseDetailResponse | ApiError;
}

/** Transport-independent case lookup, shared by GET /api/cases/:id and the MCP route. */
export async function getCaseDetail(id: string, requestId: string): Promise<CaseResult> {
  const notFound = (): CaseResult => ({
    httpStatus: 404,
    body: { request_id: requestId, error: { code: "invalid_request", message: "No approved case has that ID." } },
  });
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return notFound();

  try {
    const repo = getCaseRepository();
    const [bundle] = await repo.getBundles([id]);
    if (!bundle) return notFound();
    const evidence = evidenceViews([bundle]);
    return {
      httpStatus: 200,
      body: {
        corpus_version: await repo.corpusVersion(),
        case: toCaseCard(bundle),
        claims: evidence.claims,
        passages: evidence.passages,
        sources: evidence.sources,
      },
    };
  } catch (err) {
    const corpus = err instanceof CorpusError;
    return {
      httpStatus: 503,
      body: {
        request_id: requestId,
        error: {
          code: corpus ? "corpus_unavailable" : "internal_error",
          message: corpus ? "The historical collection could not be loaded." : "Something went wrong.",
        },
      },
    };
  }
}
