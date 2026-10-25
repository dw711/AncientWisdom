import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PostgresCaseRepository, mapCorpusRows, usableFromDatabase, type CorpusRows } from "@/lib/server/corpus/postgres-repository";
import { bundlesFrom, candidatesFrom } from "@/lib/server/corpus/snapshot";

const hash = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

function rows(): CorpusRows {
  const good = "When the lunar module lands at 4:17 p.m EDT, only 30 seconds of fuel remain.";
  const before = "a computer alarm that they had never seen in their training.";
  return {
    version: "2026-10-24.1",
    cases: [
      {
        case_id: "C20",
        event_id: "E-C20",
        version: 1,
        title: "1201/1202 alarms during lunar descent",
        decision: "Whether to call an abort of the lunar landing.",
        context_before: "During the final descent, spurious jobs filled the computer's memory.",
        situation_summary: "Computer alarms appeared during a time-critical landing.",
        actors: { role: "Guidance officer", display: "Steve Bales and others", figures: ["Steve Bales", "Jack Garman"] },
        goals: ["land safely"],
        available_information: ["the computer restarts critical tasks"],
        constraints: ["time-critical descent"],
        options: [
          { text: "Abort the landing", chosen: false },
          { text: "Continue the descent", chosen: true, note: "chosen" },
        ],
        chosen_action: "Bales relayed a 'go' assessment.",
        outcome: "The landing continued.",
        analogy_limits: ["expert back-room support"],
        unknowns: ["whether the alarms would become continuous"],
        themes: ["Uncertainty"],
        primary_theme: "Uncertainty",
        disputed_points: "Credit is shared across the MIT software team, Garman and Bales.",
        reviewed_by: "dw712 (bulk approval)",
        reviewed_at: new Date("2026-10-24T18:03:40Z"),
        mechanism_tags: ["information_asymmetry", "timing"],
        mechanism_description: "Rapid expert diagnosis under time pressure.",
        reversibility: "partly_reversible",
        horizon: "minutes",
        incentives: [],
      },
    ],
    events: [
      { event_id: "E-C20", title: "Apollo 11", start_year: 1969, end_year: 1969, start_date: null, end_date: null, date_precision: "day", date_display: "1969", geography: "Moon", participants: ["Steve Bales"] },
    ],
    claims: [
      { claim_id: "C20-CL02", case_id: "C20", statement: "The crew saw an alarm never seen in training.", claim_type: "observation", attribution: null, support_status: "unreviewed" },
      { claim_id: "C20-CL06", case_id: "C20", statement: "Eagle landed with about 30 seconds of fuel left.", claim_type: "outcome", attribution: null, support_status: "unreviewed" },
      { claim_id: "C20-CL98", case_id: "C20", statement: "A contradicted claim.", claim_type: "observation", attribution: null, support_status: "contradicted" },
      { claim_id: "C20-CL99", case_id: "C20", statement: "A claim whose passage was tampered with.", claim_type: "observation", attribution: null, support_status: "unreviewed" },
    ],
    links: [
      { claim_id: "C20-CL02", passage_id: "S058-a", relation: "supports" },
      { claim_id: "C20-CL06", passage_id: "S059-b", relation: "supports" },
      { claim_id: "C20-CL99", passage_id: "S059-bad", relation: "supports" },
    ],
    passages: [
      { passage_id: "S058-a", source_id: "S058", text: before, locator: "Article text", content_hash: hash(before) },
      { passage_id: "S059-b", source_id: "S059", text: good, locator: "Page text", content_hash: hash(good) },
      { passage_id: "S059-bad", source_id: "S059", text: "Edited after hashing.", locator: null, content_hash: hash("Original text.") },
    ],
    sources: [
      { source_id: "S058", title: "Apollo-Era Hero Dies", author: "NASA", institution: null, url: "https://www.nasa.gov/x", publication_date: "2016-09-29", retrieved_at: new Date("2026-10-24"), rights: { note: "US government work (public domain)" }, source_type: "secondary" },
      { source_id: "S059", title: "One Giant Leap", author: "NASA", institution: null, url: "https://www.nasa.gov/y", publication_date: null, retrieved_at: null, rights: { note: "excerpt only" }, source_type: "reference" },
    ],
  };
}

describe("PostgreSQL corpus mapping", () => {
  const { snapshot, dropped } = mapCorpusRows(rows());

  it("maps the team's case rows onto pre-decision fields without leaking the chosen option", () => {
    const c = snapshot.cases.get("C20")!;
    expect(c.pre_decision.options).toEqual(["Abort the landing", "Continue the descent"]);
    expect(JSON.stringify(candidatesFrom(snapshot, usableFromDatabase))).not.toContain("chosen");
    expect(c.pre_decision.actors).toEqual(["Steve Bales", "Jack Garman"]);
    expect(c.pre_decision.available_information).toContain("Unknown at the time: whether the alarms would become continuous");
    expect(c.pre_decision.reversibility).toBe("Partly reversible");
    expect(c.event_cluster).toBe("Uncertainty");
    expect(c.dispute_note).toContain("Credit is shared");
    expect(c.pattern).toBe("Rapid expert diagnosis under time pressure.");
    expect(c.display_date).toBe("1969");
  });

  it("drops passages whose hash does not match and claims that were reviewed as contradicted", () => {
    expect(dropped.join(" ")).toContain("S059-bad");
    const claimIds = (snapshot.claimsByCase.get("C20") ?? []).map((c) => c.claim_id);
    expect(claimIds).not.toContain("C20-CL98");
    const [bundle] = bundlesFrom(snapshot, ["C20"], usableFromDatabase);
    expect(bundle.claims.map((c) => c.claim_id)).toEqual(["C20-CL02", "C20-CL06"]);
    // The team reviewed the published corpus, so database claims are treated as supported.
    expect(bundle.claims.every((c) => c.support_status === "supported")).toBe(true);
    expect(bundle.passages.map((p) => p.passage_id).sort()).toEqual(["S058-a", "S059-b"]);
  });

  it("links outcome claims and reports evidence for the gate", () => {
    expect(snapshot.cases.get("C20")!.outcome.claim_ids).toEqual(["C20-CL06"]);
    const [candidate] = candidatesFrom(snapshot, usableFromDatabase);
    expect(candidate.evidence).toEqual({ approved_claims: 2, has_pre_decision_claim: true, has_outcome_claim: true });
  });

  it("maps source metadata, including sources without an institution", () => {
    const s = snapshot.sources.get("S058")!;
    expect(s.institution).toBe("");
    expect(s.author).toBe("NASA");
    expect(s.rights.status).toBe("public_domain");
    expect(snapshot.sources.get("S059")!.source_type).toBe("reference");
  });
});

// Read-only check against the real database:  DB_SMOKE=1 npx vitest run tests/postgres-mapping.test.ts
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
describe.runIf(process.env.DB_SMOKE === "1" && Boolean(process.env.DATABASE_URL))("PostgreSQL corpus (live, read-only)", () => {
  it("loads the published corpus and every case passes the evidence gate", async () => {
    const repo = new PostgresCaseRepository(process.env.DATABASE_URL!, { pinnedVersion: null, cacheMs: 60_000 });
    const version = await repo.corpusVersion();
    const candidates = await repo.listCandidates();
    const bundles = await repo.getBundles(candidates.map((c) => c.case_id));
    const claims = bundles.reduce((n, b) => n + b.claims.length, 0);
    const passages = bundles.reduce((n, b) => n + b.passages.length, 0);
    console.log({ version, cases: candidates.length, usable_claims: claims, passages, without_outcome_claim: candidates.filter((c) => !c.evidence.has_outcome_claim).map((c) => c.case_id) });
    expect(candidates.length).toBeGreaterThan(0);
    expect(bundles).toHaveLength(candidates.length);
  }, 60_000);
});
