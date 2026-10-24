import "server-only";
import { createHash } from "node:crypto";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { CorpusError, type CandidateView, type CaseBundle, type CaseRepository } from "./repository";
import type { ClaimRecord, DecisionCaseRecord, EventRecord, PassageRecord, SourceRecord } from "./schema";
import { bundlesFrom, candidatesFrom, type ClaimPolicy, type CorpusSnapshot } from "./snapshot";

/**
 * Reads the team's PostgreSQL corpus (tables: decision_case via the
 * approved_case view, mechanism_annotation, event, claim, claim_passage,
 * passage, source, corpus_version, corpus_version_case). Read-only: every
 * session sets default_transaction_read_only, and nothing here writes.
 */

// ---------------------------------------------------------------------------
// Row shapes returned by the queries below.
// ---------------------------------------------------------------------------

export interface CaseRow {
  case_id: string;
  event_id: string | null;
  version: number;
  title: string;
  decision: string;
  context_before: string;
  situation_summary: string | null;
  actors: unknown;
  goals: unknown;
  available_information: unknown;
  constraints: unknown;
  options: unknown;
  chosen_action: string | null;
  outcome: string | null;
  analogy_limits: unknown;
  unknowns: unknown;
  themes: string[] | null;
  primary_theme: string | null;
  disputed_points: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | string | null;
  mechanism_tags: string[] | null;
  mechanism_description: string | null;
  reversibility: string | null;
  horizon: string | null;
  incentives: unknown;
}
export interface EventRow {
  event_id: string;
  title: string;
  start_year: number | null;
  end_year: number | null;
  start_date: Date | string | null;
  end_date: Date | string | null;
  date_precision: string;
  date_display: string | null;
  geography: string | null;
  participants: unknown;
}
export interface ClaimRow {
  claim_id: string;
  case_id: string;
  statement: string;
  claim_type: "observation" | "interpretation" | "outcome";
  attribution: string | null;
  support_status: string;
}
export interface LinkRow {
  claim_id: string;
  passage_id: string;
  relation: "supports" | "contradicts";
}
export interface PassageRow {
  passage_id: string;
  source_id: string;
  text: string;
  locator: string | null;
  content_hash: string;
}
export interface SourceRow {
  source_id: string;
  title: string;
  author: string | null;
  institution: string | null;
  url: string | null;
  publication_date: string | null;
  retrieved_at: Date | string | null;
  rights: unknown;
  source_type: string | null;
}
export interface CorpusRows {
  version: string;
  cases: CaseRow[];
  events: EventRow[];
  claims: ClaimRow[];
  links: LinkRow[];
  passages: PassageRow[];
  sources: SourceRow[];
}

// ---------------------------------------------------------------------------
// Pure mapping from rows to the application's records (unit-tested).
// ---------------------------------------------------------------------------

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Accepts ["a", "b"] or [{ text: "a" }, …] and returns plain strings. */
export function stringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        return text(o.text) || text(o.display) || text(o.name) || text(o.label);
      }
      return "";
    })
    .filter(Boolean);
}

/** Actors are stored as { role, display, figures[] } or as a list. */
export function actorList(v: unknown): string[] {
  if (Array.isArray(v)) return stringList(v);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const figures = stringList(o.figures);
    if (figures.length) return figures;
    return [text(o.display) || text(o.role)].filter(Boolean);
  }
  return [];
}

const isoDate = (v: Date | string | null): string => {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
};

const REVERSIBILITY: Record<string, string> = {
  reversible: "Reversible",
  partly_reversible: "Partly reversible",
  irreversible: "Irreversible",
  unknown: "Unknown",
};

function eventDisplay(e: EventRow): string {
  if (e.date_display) return e.date_display;
  if (e.start_year && e.end_year && e.end_year !== e.start_year) return `${e.start_year}–${e.end_year}`;
  return e.start_year ? String(e.start_year) : "Date unknown";
}

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export interface MappedCorpus {
  snapshot: CorpusSnapshot;
  /** Records dropped by integrity checks, for logging. */
  dropped: string[];
}

export function mapCorpusRows(rows: CorpusRows): MappedCorpus {
  const dropped: string[] = [];

  const sources = new Map<string, SourceRecord>();
  for (const s of rows.sources) {
    if (!s.url) {
      dropped.push(`${s.source_id}: no URL`);
      continue;
    }
    const note = text((s.rights as Record<string, unknown> | null)?.note);
    sources.set(s.source_id, {
      source_id: s.source_id,
      title: s.title,
      institution: s.institution ?? "",
      author: s.author,
      url: s.url,
      archived_url: null,
      publication_date: s.publication_date,
      publication_date_display: s.publication_date,
      retrieved_at: isoDate(s.retrieved_at),
      retrieval_note: null,
      rights: { status: /public domain/i.test(note) ? "public_domain" : "copyright_excerpt", note },
      source_type: s.source_type === "primary" || s.source_type === "reference" ? s.source_type : "secondary",
    });
  }

  const passages = new Map<string, PassageRecord>();
  for (const p of rows.passages) {
    const digest = sha256(p.text);
    if (digest !== p.content_hash.replace(/^sha256:/, "")) {
      dropped.push(`${p.passage_id}: content hash does not match text`);
      continue;
    }
    if (!sources.has(p.source_id)) {
      dropped.push(`${p.passage_id}: unknown or unusable source ${p.source_id}`);
      continue;
    }
    passages.set(p.passage_id, { passage_id: p.passage_id, source_id: p.source_id, locator: p.locator ?? "", text: p.text, content_hash: `sha256:${digest}` });
  }

  const linksByClaim = new Map<string, LinkRow[]>();
  for (const l of rows.links) linksByClaim.set(l.claim_id, [...(linksByClaim.get(l.claim_id) ?? []), l]);

  const claimsByCase = new Map<string, ClaimRecord[]>();
  for (const c of rows.claims) {
    // Claims reviewed as contradicted or lacking evidence are never used.
    if (c.support_status === "contradicted" || c.support_status === "insufficient_evidence") continue;
    const links = linksByClaim.get(c.claim_id) ?? [];
    const claim: ClaimRecord = {
      claim_id: c.claim_id,
      case_id: c.case_id,
      statement: c.statement,
      type: c.claim_type,
      phase: c.claim_type === "outcome" ? "outcome" : "unspecified",
      attribution: c.attribution,
      // The team has reviewed the published corpus, so every claim that is not
      // marked contradicted or lacking evidence is treated as supported.
      support_status: "supported",
      supporting_passage_ids: links.filter((l) => l.relation === "supports" && passages.has(l.passage_id)).map((l) => l.passage_id),
      contradicting_passage_ids: links.filter((l) => l.relation === "contradicts").map((l) => l.passage_id),
    };
    claimsByCase.set(c.case_id, [...(claimsByCase.get(c.case_id) ?? []), claim]);
  }

  const events = new Map<string, EventRecord>();
  for (const e of rows.events) {
    const precision = (["day", "month", "year", "decade", "century", "approximate"] as const).find((p) => p === e.date_precision) ?? "approximate";
    events.set(e.event_id, {
      event_id: e.event_id,
      title: e.title,
      date: { start: isoDate(e.start_date) || String(e.start_year ?? ""), end: isoDate(e.end_date) || (e.end_year ? String(e.end_year) : null), precision, display: eventDisplay(e) },
      geography: e.geography ?? "",
      participants: stringList(e.participants),
      date_claim_ids: [],
    });
  }

  const cases = new Map<string, DecisionCaseRecord>();
  for (const r of rows.cases) {
    const eventId = r.event_id ?? `EVT-${r.case_id}`;
    if (!events.has(eventId)) {
      events.set(eventId, {
        event_id: eventId,
        title: r.title,
        date: { start: "", end: null, precision: "approximate", display: "Date unknown" },
        geography: "",
        participants: [],
        date_claim_ids: [],
      });
    }
    const claims = claimsByCase.get(r.case_id) ?? [];
    const usableOutcomes = claims.filter((c) => c.phase === "outcome" && usableFromDatabase(c)).map((c) => c.claim_id);
    const tags = (r.mechanism_tags ?? []).filter((t) => /^[a-z_]+$/.test(t));
    cases.set(r.case_id, {
      case_id: r.case_id,
      event_id: eventId,
      version: r.version,
      title: r.title,
      display_date: events.get(eventId)!.date.display,
      decision_question: r.decision,
      // The database stores the narrative without per-sentence claim links.
      context_summary: { text: r.context_before, claim_ids: [] },
      pre_decision: {
        situation: r.context_before,
        available_information: [...stringList(r.available_information), ...stringList(r.unknowns).map((u) => `Unknown at the time: ${u}`)],
        actors: actorList(r.actors),
        goals: stringList(r.goals),
        // Option text only: the stored `chosen` flag would reveal the outcome to ranking.
        options: stringList(r.options),
        options_are_editorial: false,
        incentives: stringList(r.incentives),
        constraints: stringList(r.constraints),
        time_pressure: r.horizon ?? "",
        reversibility: REVERSIBILITY[r.reversibility ?? "unknown"] ?? "Unknown",
      },
      chosen_action: { text: r.chosen_action ?? "Not recorded.", claim_ids: [] },
      outcome: { text: r.outcome ?? "Not recorded.", claim_ids: usableOutcomes, uncertainty: "" },
      mechanism_tags: tags.length ? tags : ["unclassified"],
      event_cluster: r.primary_theme ?? r.themes?.[0] ?? eventId,
      interpretation_disputes: [],
      dispute_note: r.disputed_points,
      analogy_limits: stringList(r.analogy_limits),
      lesson: { text: "", conditions: [] },
      pattern: r.mechanism_description,
      search_text: { situation: r.situation_summary ?? r.decision, mechanism: r.mechanism_description ?? tags.join(" ").replace(/_/g, " ") },
      review: {
        status: "approved",
        reviewed_by: r.reviewed_by ?? "",
        reviewed_at: isoDate(r.reviewed_at),
        method: "Approved in the team database",
        notes: null,
      },
    });
  }

  return { snapshot: { version: rows.version, sources, passages, events, cases, claimsByCase }, dropped };
}

/**
 * Database claims are usable when at least one hash-verified passage supports
 * them and none contradicts them. Every point written from them is still
 * checked against its passages.
 */
export const usableFromDatabase: ClaimPolicy = (c) => c.supporting_passage_ids.length > 0 && c.contradicting_passage_ids.length === 0;

// ---------------------------------------------------------------------------
// Loader with a short-lived cache.
// ---------------------------------------------------------------------------

const pools = new Map<string, Pool>();

function poolFor(url: string): Pool {
  let pool = pools.get(url);
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      // Defence in depth: the application never writes to the corpus.
      options: "-c default_transaction_read_only=on -c statement_timeout=15000",
    });
    pool.on("error", (err) => console.error(JSON.stringify({ event: "pg_pool_error", message: err.message })));
    // On Vercel Fluid compute, releases idle clients before an instance suspends.
    attachDatabasePool(pool);
    pools.set(url, pool);
  }
  return pool;
}

const CASE_COLUMNS = `ac.case_id, ac.event_id, ac.version, ac.title, ac.decision, ac.context_before, ac.situation_summary,
  ac.actors, ac.goals, ac.available_information, ac.constraints, ac.options, ac.chosen_action, ac.outcome,
  ac.analogy_limits, ac.unknowns, ac.themes, ac.primary_theme, ac.disputed_points, ac.reviewed_by, ac.reviewed_at,
  ac.mechanism_tags, ac.mechanism_description, ac.reversibility, ac.horizon, ma.incentives`;

export async function fetchCorpusRows(pool: Pool, pinnedVersion: string | null): Promise<CorpusRows> {
  const client = await pool.connect();
  try {
    const versionRow = pinnedVersion
      ? await client.query<{ corpus_version: string }>("select corpus_version from corpus_version where corpus_version = $1", [pinnedVersion])
      : await client.query<{ corpus_version: string }>(
          "select corpus_version from corpus_version where published_at is not null order by published_at desc, created_at desc limit 1",
        );
    const version = versionRow.rows[0]?.corpus_version;
    if (!version) throw new CorpusError(pinnedVersion ? `Corpus version ${pinnedVersion} was not found` : "No published corpus version was found");

    const cases = await client.query<CaseRow>(
      `select ${CASE_COLUMNS}
         from approved_case ac
         join corpus_version_case cvc on cvc.case_id = ac.case_id and cvc.case_version = ac.version
         left join mechanism_annotation ma on ma.case_id = ac.case_id
        where cvc.corpus_version = $1`,
      [version],
    );
    const caseIds = cases.rows.map((c) => c.case_id);
    const eventIds = cases.rows.map((c) => c.event_id).filter((e): e is string => Boolean(e));
    const [events, claims, links] = await Promise.all([
      client.query<EventRow>(
        "select event_id, title, start_year, end_year, start_date, end_date, date_precision, date_display, geography, participants from event where event_id = any($1)",
        [eventIds],
      ),
      client.query<ClaimRow>("select claim_id, case_id, statement, claim_type, attribution, support_status from claim where case_id = any($1)", [caseIds]),
      client.query<LinkRow>(
        "select cp.claim_id, cp.passage_id, cp.relation from claim_passage cp join claim c on c.claim_id = cp.claim_id where c.case_id = any($1)",
        [caseIds],
      ),
    ]);
    const passageIds = [...new Set(links.rows.map((l) => l.passage_id))];
    const passages = await client.query<PassageRow>("select passage_id, source_id, text, locator, content_hash from passage where passage_id = any($1)", [passageIds]);
    const sourceIds = [...new Set(passages.rows.map((p) => p.source_id))];
    const sources = await client.query<SourceRow>(
      "select source_id, title, author, institution, url, publication_date, retrieved_at, rights, source_type from source where source_id = any($1)",
      [sourceIds],
    );
    return { version, cases: cases.rows, events: events.rows, claims: claims.rows, links: links.rows, passages: passages.rows, sources: sources.rows };
  } finally {
    client.release();
  }
}

export class PostgresCaseRepository implements CaseRepository {
  readonly kind = "postgres";
  private cached: { snapshot: CorpusSnapshot; loadedAt: number } | null = null;
  private inflight: Promise<CorpusSnapshot> | null = null;

  constructor(
    private readonly url: string,
    private readonly opts: { pinnedVersion: string | null; cacheMs: number },
  ) {}

  private async load(): Promise<CorpusSnapshot> {
    if (this.cached && Date.now() - this.cached.loadedAt < this.opts.cacheMs) return this.cached.snapshot;
    if (!this.inflight) {
      this.inflight = (async () => {
        try {
          const rows = await fetchCorpusRows(poolFor(this.url), this.opts.pinnedVersion);
          const { snapshot, dropped } = mapCorpusRows(rows);
          if (dropped.length) console.warn(JSON.stringify({ event: "corpus_records_dropped", version: snapshot.version, count: dropped.length, examples: dropped.slice(0, 5) }));
          this.cached = { snapshot, loadedAt: Date.now() };
          return snapshot;
        } catch (err) {
          // Keep serving the last good snapshot if a refresh fails.
          if (this.cached) {
            console.error(JSON.stringify({ event: "corpus_refresh_failed", message: err instanceof Error ? err.message : String(err) }));
            return this.cached.snapshot;
          }
          if (err instanceof CorpusError) throw err;
          throw new CorpusError("The corpus database could not be read", [err instanceof Error ? err.message : String(err)]);
        } finally {
          this.inflight = null;
        }
      })();
    }
    return this.inflight;
  }

  async corpusVersion(): Promise<string> {
    return (await this.load()).version;
  }

  async listCandidates(): Promise<CandidateView[]> {
    return candidatesFrom(await this.load(), usableFromDatabase);
  }

  async getBundles(caseIds: string[]): Promise<CaseBundle[]> {
    return bundlesFrom(await this.load(), caseIds, usableFromDatabase);
  }
}
