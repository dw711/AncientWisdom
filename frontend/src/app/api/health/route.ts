import { connection } from "next/server";
import type { HealthResponse } from "@/lib/contracts/advice";
import { loadConfig, PIPELINE_VERSION } from "@/lib/server/config";
import { getCaseRepository } from "@/lib/server/corpus";
import { RUBRIC_VERSION } from "@/lib/server/ranking/rubric";

/** Reports configuration state without exposing secrets or calling providers. */
export async function GET() {
  await connection();
  const config = loadConfig();
  const issues: string[] = [];
  let corpus: HealthResponse["corpus"] = null;
  try {
    const repo = getCaseRepository(config);
    corpus = { version: await repo.corpusVersion(), approved_cases: (await repo.listCandidates()).length, storage: repo.kind };
  } catch {
    issues.push("The historical collection could not be loaded.");
  }
  if (config.mode === "live" && !config.jev.apiKey) issues.push("Live mode is selected but OPENROUTER_API_KEY is not set.");

  const body: HealthResponse = {
    status: issues.length ? "degraded" : "ok",
    mode: config.mode,
    corpus,
    providers: {
      billing: "openrouter",
      jev: { configured: Boolean(config.jev.apiKey), model: config.jev.model },
      llm: { configured: Boolean(config.llm.apiKey), model: config.llm.model },
    },
    versions: { rubric: RUBRIC_VERSION, pipeline: PIPELINE_VERSION, weights: config.weightsVersion },
    issues,
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
