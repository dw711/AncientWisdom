import "server-only";
import { loadConfig, type AppConfig } from "@/lib/server/config";
import { JsonCaseRepository } from "./json-repository";
import { PostgresCaseRepository } from "./postgres-repository";
import type { CaseRepository } from "./repository";

const repositories = new Map<string, CaseRepository>();

/**
 * The single place that chooses a storage implementation. Preview mode always
 * uses the JSON seed, because its prewritten samples cite those cases. Live
 * mode reads the team's PostgreSQL corpus when DATABASE_URL is configured.
 */
export function getCaseRepository(config: AppConfig = loadConfig()): CaseRepository {
  const usePostgres = config.mode === "live" && config.corpusSource === "postgres" && config.databaseUrl;
  const key = usePostgres ? `pg:${config.corpusVersionPin ?? "latest"}` : `json:${config.corpusDir}`;
  let repo = repositories.get(key);
  if (!repo) {
    repo = usePostgres
      ? new PostgresCaseRepository(config.databaseUrl!, { pinnedVersion: config.corpusVersionPin, cacheMs: config.corpusCacheMs })
      : new JsonCaseRepository(config.corpusDir);
    repositories.set(key, repo);
  }
  return repo;
}

export type { CaseRepository, CandidateView, CaseBundle } from "./repository";
export { CorpusError } from "./repository";
