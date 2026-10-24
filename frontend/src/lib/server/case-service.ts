import "server-only";
import type { CaseDetailResponse } from "@/lib/contracts/advice";
import { getCaseRepository } from "@/lib/server/corpus";
import { evidenceViews, toCaseCard } from "@/lib/server/corpus/views";

/**
 * One approved case with its claims, passages and sources. Returns null when
 * no approved case has that ID. Shared by the HTTP route and the MCP tool so
 * both surfaces serve identical case stories.
 */
export async function getCaseDetail(id: string): Promise<CaseDetailResponse | null> {
  const repo = getCaseRepository();
  const [bundle] = await repo.getBundles([id]);
  if (!bundle) return null;
  const evidence = evidenceViews([bundle]);
  return {
    corpus_version: await repo.corpusVersion(),
    case: toCaseCard(bundle),
    claims: evidence.claims,
    passages: evidence.passages,
    sources: evidence.sources,
  };
}
