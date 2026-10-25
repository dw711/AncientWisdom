import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { CorpusError, type CandidateView, type CaseBundle, type CaseRepository } from "./repository";
import { bundlesFrom, candidatesFrom, type CorpusSnapshot } from "./snapshot";
import {
  ClaimRecordSchema,
  CorpusManifestSchema,
  DecisionCaseRecordSchema,
  EventRecordSchema,
  PassageRecordSchema,
  SourceRecordSchema,
  type ClaimRecord,
  type CorpusManifest,
  type DecisionCaseRecord,
  type EventRecord,
  type PassageRecord,
  type SourceRecord,
} from "./schema";

interface LoadedCorpus {
  manifest: CorpusManifest;
  sources: Map<string, SourceRecord>;
  passages: Map<string, PassageRecord>;
  events: Map<string, EventRecord>;
  cases: Map<string, DecisionCaseRecord>;
  claims: Map<string, ClaimRecord>;
  claimsByCase: Map<string, ClaimRecord[]>;
}

export function hashPassage(text: string): string {
  return "sha256:" + createHash("sha256").update(text, "utf8").digest("hex");
}

async function readJson<T>(dir: string, file: string, schema: z.ZodType<T>): Promise<T> {
  const full = path.join(dir, file);
  let raw: string;
  try {
    raw = await readFile(full, "utf8");
  } catch {
    throw new CorpusError(`Corpus file is missing: ${file}`);
  }
  const parsed = schema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new CorpusError(
      `Corpus file failed validation: ${file}`,
      parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }
  return parsed.data;
}

function indexBy<T, K extends keyof T>(items: T[], key: K, label: string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    const id = String(item[key]);
    if (map.has(id)) throw new CorpusError(`Duplicate ${label} id: ${id}`);
    map.set(id, item);
  }
  return map;
}

/** Referential and content-hash checks; a corpus that fails is not served. */
export function checkIntegrity(c: Omit<LoadedCorpus, "claimsByCase">): string[] {
  const issues: string[] = [];
  for (const p of c.passages.values()) {
    if (!c.sources.has(p.source_id)) issues.push(`${p.passage_id}: unknown source ${p.source_id}`);
    if (hashPassage(p.text) !== p.content_hash) issues.push(`${p.passage_id}: content hash does not match text`);
  }
  for (const claim of c.claims.values()) {
    if (!c.cases.has(claim.case_id)) issues.push(`${claim.claim_id}: unknown case ${claim.case_id}`);
    for (const pid of [...claim.supporting_passage_ids, ...claim.contradicting_passage_ids]) {
      if (!c.passages.has(pid)) issues.push(`${claim.claim_id}: unknown passage ${pid}`);
    }
  }
  for (const ev of c.events.values()) {
    for (const cid of ev.date_claim_ids) if (!c.claims.has(cid)) issues.push(`${ev.event_id}: unknown date claim ${cid}`);
  }
  for (const rec of c.cases.values()) {
    if (!c.events.has(rec.event_id)) issues.push(`${rec.case_id}: unknown event ${rec.event_id}`);
    const refs = [
      ...rec.context_summary.claim_ids,
      ...rec.chosen_action.claim_ids,
      ...rec.outcome.claim_ids,
      ...rec.interpretation_disputes.flatMap((d) => d.positions.flatMap((p) => p.claim_ids)),
    ];
    for (const cid of refs) {
      const claim = c.claims.get(cid);
      if (!claim) issues.push(`${rec.case_id}: unknown claim ${cid}`);
      else if (claim.case_id !== rec.case_id) issues.push(`${rec.case_id}: claim ${cid} belongs to ${claim.case_id}`);
    }
    for (const cid of rec.context_summary.claim_ids) {
      if (c.claims.get(cid)?.phase === "outcome") issues.push(`${rec.case_id}: context cites outcome claim ${cid}`);
    }
  }
  return issues;
}

/** The seed fixture is fully reviewed, so only reviewed claims are used. */
const reviewedOnly = (claim: ClaimRecord) => claim.support_status === "supported";

export class JsonCaseRepository implements CaseRepository {
  readonly kind = "json-fixture";
  private loading: Promise<LoadedCorpus> | null = null;

  constructor(private readonly dir: string) {}

  private load(): Promise<LoadedCorpus> {
    if (!this.loading) {
      this.loading = this.read().catch((err) => {
        this.loading = null;
        throw err;
      });
    }
    return this.loading;
  }

  private async read(): Promise<LoadedCorpus> {
    // Relative names resolve inside data/corpus, which keeps build output tracing scoped to that folder.
    const dir = path.isAbsolute(this.dir) ? this.dir : path.join(process.cwd(), "data", "corpus", this.dir);
    const [manifest, sources, passages, events, cases, claims] = await Promise.all([
      readJson(dir, "manifest.json", CorpusManifestSchema),
      readJson(dir, "sources.json", z.array(SourceRecordSchema)),
      readJson(dir, "passages.json", z.array(PassageRecordSchema)),
      readJson(dir, "events.json", z.array(EventRecordSchema)),
      readJson(dir, "cases.json", z.array(DecisionCaseRecordSchema)),
      readJson(dir, "claims.json", z.array(ClaimRecordSchema)),
    ]);
    const corpus = {
      manifest,
      sources: indexBy(sources, "source_id", "source"),
      passages: indexBy(passages, "passage_id", "passage"),
      events: indexBy(events, "event_id", "event"),
      cases: indexBy(cases, "case_id", "case"),
      claims: indexBy(claims, "claim_id", "claim"),
    };
    const issues = checkIntegrity(corpus);
    if (issues.length) throw new CorpusError("Corpus integrity check failed", issues);
    const claimsByCase = new Map<string, ClaimRecord[]>();
    for (const claim of claims) {
      const list = claimsByCase.get(claim.case_id) ?? [];
      list.push(claim);
      claimsByCase.set(claim.case_id, list);
    }
    return { ...corpus, claimsByCase };
  }

  async corpusVersion(): Promise<string> {
    return (await this.load()).manifest.corpus_version;
  }

  private async snapshot(): Promise<CorpusSnapshot> {
    const c = await this.load();
    return { version: c.manifest.corpus_version, sources: c.sources, passages: c.passages, events: c.events, cases: c.cases, claimsByCase: c.claimsByCase };
  }

  async listCandidates(): Promise<CandidateView[]> {
    return candidatesFrom(await this.snapshot(), reviewedOnly);
  }

  async getBundles(caseIds: string[]): Promise<CaseBundle[]> {
    return bundlesFrom(await this.snapshot(), caseIds, reviewedOnly);
  }
}
