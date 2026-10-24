import { z } from "zod";

/**
 * Storage-level schema for the historical corpus. One file (or table) per
 * record type keeps source and passage identity stable, so evidence links
 * survive a move to PostgreSQL: each schema below maps to one table.
 */

const id = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[A-Z0-9_]+$`));

export const SourceRecordSchema = z.object({
  source_id: id("SRC"),
  title: z.string().min(1),
  institution: z.string().min(1),
  author: z.string().nullable(),
  url: z.url(),
  archived_url: z.url().nullable(),
  publication_date: z.string().nullable(),
  publication_date_display: z.string().nullable(),
  retrieved_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  retrieval_note: z.string().nullable(),
  rights: z.object({
    status: z.enum(["public_domain", "copyright_excerpt", "licensed"]),
    note: z.string(),
  }),
  source_type: z.enum(["primary", "official_secondary", "secondary", "reference"]),
});

export const PassageRecordSchema = z.object({
  passage_id: id("PSG"),
  source_id: id("SRC"),
  locator: z.string(),
  /** Exact permitted excerpt, whitespace-normalised. */
  text: z.string().min(1).max(2400),
  content_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
});

export const EventRecordSchema = z.object({
  event_id: id("EVT"),
  title: z.string(),
  date: z.object({
    start: z.string(),
    end: z.string().nullable(),
    precision: z.enum(["day", "month", "year", "decade", "century", "approximate"]),
    display: z.string(),
  }),
  geography: z.string(),
  participants: z.array(z.string()),
  date_claim_ids: z.array(id("CLM")),
});

export const ClaimRecordSchema = z.object({
  claim_id: id("CLM"),
  case_id: id("CASE"),
  statement: z.string().min(1),
  type: z.enum(["observation", "interpretation", "outcome"]),
  /** "unspecified" when the source data records only the claim type. */
  phase: z.enum(["pre_decision", "decision", "outcome", "unspecified"]),
  attribution: z.string().nullable(),
  /** "unverified": approved with the case but not yet individually reviewed. */
  support_status: z.enum(["supported", "unverified"]),
  supporting_passage_ids: z.array(id("PSG")).min(1),
  contradicting_passage_ids: z.array(id("PSG")),
});

const Referenced = z.object({ text: z.string().min(1), claim_ids: z.array(id("CLM")).min(1) });

export const DecisionCaseRecordSchema = z.object({
  case_id: id("CASE"),
  event_id: id("EVT"),
  version: z.number().int().positive(),
  title: z.string(),
  display_date: z.string(),
  decision_question: z.string(),
  context_summary: Referenced,
  /** Everything Jev may see during ranking. Must not contain the chosen action or outcome. */
  pre_decision: z.object({
    situation: z.string(),
    available_information: z.array(z.string()),
    actors: z.array(z.string()),
    goals: z.array(z.string()),
    options: z.array(z.string()).min(2),
    options_are_editorial: z.boolean(),
    incentives: z.array(z.string()),
    constraints: z.array(z.string()),
    time_pressure: z.string(),
    reversibility: z.string(),
  }),
  chosen_action: Referenced,
  outcome: Referenced.extend({ uncertainty: z.string() }),
  mechanism_tags: z.array(z.string().regex(/^[a-z_]+$/)).min(1),
  event_cluster: z.string(),
  interpretation_disputes: z.array(
    z.object({
      dispute_id: id("DSP"),
      summary: z.string(),
      positions: z.array(z.object({ attribution: z.string(), position: z.string(), claim_ids: z.array(id("CLM")).min(1) })).min(2),
    }),
  ),
  dispute_note: z.string().nullable(),
  analogy_limits: z.array(z.string()).min(1),
  /** Editorial interpretation, always displayed as such. */
  lesson: z.object({ text: z.string(), conditions: z.array(z.string()).min(1) }),
  /** The decision pattern the case illustrates, when the source data records one. */
  pattern: z.string().nullable().default(null),
  search_text: z.object({ situation: z.string(), mechanism: z.string() }),
  review: z.object({
    status: z.enum(["approved", "draft", "rejected"]),
    reviewed_by: z.string(),
    reviewed_at: z.string(),
    method: z.string(),
    notes: z.string().nullable(),
  }),
});

export const CorpusManifestSchema = z.object({
  corpus_version: z.string().min(1),
  created_at: z.string(),
  description: z.string(),
  review: z.object({ method: z.string(), limitations: z.array(z.string()) }),
});

export type SourceRecord = z.infer<typeof SourceRecordSchema>;
export type PassageRecord = z.infer<typeof PassageRecordSchema>;
export type EventRecord = z.infer<typeof EventRecordSchema>;
export type ClaimRecord = z.infer<typeof ClaimRecordSchema>;
export type DecisionCaseRecord = z.infer<typeof DecisionCaseRecordSchema>;
export type CorpusManifest = z.infer<typeof CorpusManifestSchema>;
