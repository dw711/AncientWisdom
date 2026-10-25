import "server-only";
import type { AdviceRequest, AdviceResponse, Comparison, ProgressStage, Versions } from "@/lib/contracts/advice";
import type { AppConfig } from "@/lib/server/config";
import { PIPELINE_VERSION } from "@/lib/server/config";
import type { CaseBundle, CaseRepository } from "@/lib/server/corpus/repository";
import { toCaseCard } from "@/lib/server/corpus/views";
import { extractProfile, fallbackProfile } from "@/lib/server/profile/extract";
import { LlmError, type LlmClient } from "@/lib/server/providers/llm";
import type { JevClient } from "@/lib/server/providers/jev";
import { findChallengingCase, type ChallengeResult } from "@/lib/server/ranking/challenge";
import { rankCandidates, type RankedCandidate, type RankingResult } from "@/lib/server/ranking/rank";
import { RUBRIC_VERSION } from "@/lib/server/ranking/rubric";
import { selectCases } from "@/lib/server/ranking/select";
import { selectCandidates } from "@/lib/server/retrieval/candidates";
import type { WriterOutput } from "@/lib/server/synthesis/schema";
import { createWriter } from "@/lib/server/synthesis/write";
import { validateWithRepair } from "@/lib/server/validation/run";
import { buildChangeConditions, buildComparison } from "./assemble";
import { base, emptyPartial, insufficient, type ResponseContext } from "./responses";
import { createDeadline, Stopwatch } from "./runtime";

export interface PipelineDeps {
  repo: CaseRepository;
  jev: JevClient;
  llm: LlmClient | null;
  config: AppConfig;
}

export interface RunOptions {
  requestId: string;
  signal?: AbortSignal;
  onProgress?: (stage: ProgressStage, message: string) => void;
}

export class CancelledError extends Error {
  constructor() {
    super("The request was cancelled");
    this.name = "CancelledError";
  }
}

/** Every approved case in a small corpus reaches Jev; the lexical prefilter only applies above this. */
const CANDIDATE_LIMIT = 40;

function reason(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown error";
}

export async function runLivePipeline(req: AdviceRequest, deps: PipelineDeps, opts: RunOptions): Promise<AdviceResponse> {
  const { repo, jev, llm, config } = deps;
  const sw = new Stopwatch();
  const deadline = createDeadline(config.deadlineMs, opts.signal);
  const progress = (stage: ProgressStage, message: string) => opts.onProgress?.(stage, message);
  const cancelled = () => opts.signal?.aborted === true;
  const guard = (err: unknown) => {
    if (cancelled()) throw new CancelledError();
    return err;
  };

  const versions: Versions = {
    corpus: await repo.corpusVersion(),
    rubric: RUBRIC_VERSION,
    pipeline: PIPELINE_VERSION,
    weights: config.weightsVersion,
    jev_model: null,
    llm_model: null,
  };
  const warnings: string[] = [];
  const ctx: ResponseContext = { requestId: opts.requestId, mode: "live", sample: false, versions, warnings, timings: () => sw.total() };

  // 1–2. Decision profile, with at most one targeted clarification.
  progress("profile", "Identifying the decision, its options and constraints");
  let profile = fallbackProfile(req);
  if (llm) {
    try {
      const result = await extractProfile(req, llm, deadline, config.llm.profileTimeoutMs, config.llm.extractionEffort);
      profile = result.profile;
      versions.llm_model = result.llmModel;
      if (result.clarification) {
        sw.lap("profile");
        return { ...base(ctx, profile), status: "needs_clarification", questions: result.clarification };
      }
    } catch (err) {
      guard(err);
      warnings.push(`The decision profile could not be extracted, so the comparison used your description directly. Technical detail: ${reason(err)}.`);
    }
  } else {
    warnings.push("The writing model is not configured, so no decision profile or written advice can be produced.");
  }
  sw.lap("profile");

  // 3. Candidate retrieval from approved cases only.
  progress("retrieve", "Gathering approved historical cases");
  const candidates = selectCandidates(profile, req.query, await repo.listCandidates(), CANDIDATE_LIMIT);
  sw.lap("retrieve");

  // 4. Jev ranking on pre-decision information only.
  progress("rank", `Assessing analogy fit for ${candidates.length} cases with Jev`);
  let ranking: RankingResult;
  try {
    ranking = await rankCandidates({
      profile,
      query: req.query,
      candidates,
      jev,
      weights: config.weights,
      thresholds: config.thresholds,
      batchSize: config.jev.batchSize,
      concurrency: config.jev.concurrency,
      deadline,
    });
    versions.jev_model = ranking.jevModel ?? jev.model;
  } catch (err) {
    guard(err);
    sw.lap("rank");
    warnings.push(`Technical detail: Jev ranking failed (${reason(err)}).`);
    const bundles = await repo.getBundles(candidates.slice(0, req.max_cases).map((c) => c.case_id));
    return {
      ...base(ctx, profile, bundles),
      ...emptyPartial(),
      status: "partial",
      preview: false,
      message: "Jev could not assess analogy fit, so these approved cases are shown without ratings or personalised advice.",
      missing: [
        { part: "ranking", reason: "Jev could not rate how closely these cases match your decision this time." },
        { part: "advice", reason: "Advice is not written without an analogy assessment." },
      ],
      ranking_status: "unavailable",
      unranked_cases: bundles.map(toCaseCard),
    };
  }
  sw.lap("rank");

  // 5. Selection with eligibility gates and diversity.
  const { selected, nearMisses } = selectCases(ranking.ranked, req.max_cases);
  const allNearMisses = [
    ...nearMisses,
    ...ranking.excluded.map((e) => ({ case_id: e.candidate.case_id, title: e.candidate.title, analogy_fit: null, reasons: e.reasons })),
  ];
  if (!selected.length) {
    return insufficient(ctx, profile, "no_relevant_case", "No approved case in the collection is a close enough match to compare responsibly.", allNearMisses);
  }

  // 6. Fetch full records (including outcomes) only after structural selection.
  progress("evidence", "Fetching sources and outcomes for the selected cases");
  const eligible = ranking.ranked.filter((r) => r.rating.eligible);
  const bundleList = await repo.getBundles(eligible.map((r) => r.candidate.case_id));
  const bundles = new Map(bundleList.map((b) => [b.record.case_id, b]));
  const lead = selected[0];

  // 7. Counterexample pass against the lead case's lesson.
  progress("challenge", "Looking for a relevant case that challenges the first lesson");
  let challenge: ChallengeResult;
  try {
    challenge = await findChallengingCase({
      profile,
      query: req.query,
      lead: bundles.get(lead.candidate.case_id)!,
      pool: eligible.filter((r) => r !== lead && bundles.has(r.candidate.case_id)).map((r) => ({ bundle: bundles.get(r.candidate.case_id)!, ranked: r })),
      jev,
      threshold: config.thresholds.challenge,
      deadline,
    });
  } catch (err) {
    guard(err);
    challenge = { caseId: null, probabilities: {}, note: "The search for a challenging case could not run this time." };
    warnings.push(`The counterexample check failed (${reason(err)}).`);
  }
  sw.lap("challenge");

  const supporting = selected.filter((r) => r.candidate.case_id !== challenge.caseId);
  const challengingRanked = challenge.caseId ? eligible.find((r) => r.candidate.case_id === challenge.caseId) ?? null : null;
  const shown: { ranked: RankedCandidate; role: "supporting" | "challenging" }[] = [
    ...supporting.map((ranked) => ({ ranked, role: "supporting" as const })),
    ...(challengingRanked ? [{ ranked: challengingRanked, role: "challenging" as const }] : []),
  ];
  const shownBundles = new Map<string, CaseBundle>(shown.map((s) => [s.ranked.candidate.case_id, bundles.get(s.ranked.candidate.case_id)!]));

  const ratedPartial = (message: string, missingReason: string): AdviceResponse => ({
    ...base(ctx, profile, [...shownBundles.values()]),
    ...emptyPartial(),
    status: "partial",
    preview: false,
    message,
    missing: [{ part: "advice", reason: missingReason }],
    ranking_status: "ok",
    rated_cases: shown.map((s) => ({ case: toCaseCard(shownBundles.get(s.ranked.candidate.case_id)!), rating: s.ranked.rating, role: s.role })),
    challenging_note: challenge.note,
  });

  // 8. Structured synthesis.
  if (!llm) {
    return ratedPartial("These cases were rated by Jev, but written comparisons and advice need the writing model, which is not configured.", "The writing model is not configured on the server.");
  }
  progress("write", "Writing comparisons and conditional advice");
  const writer = createWriter({
    llm,
    req,
    profile,
    cases: shown.map((s) => ({ bundle: shownBundles.get(s.ranked.candidate.case_id)!, rating: s.ranked.rating, role: s.role })),
    challengeNote: challenge.note,
    deadline,
    timeoutMs: config.llm.timeoutMs,
    effort: config.llm.synthesisEffort,
  });
  let draft: WriterOutput;
  try {
    const result = await writer.write();
    draft = result.draft;
    versions.llm_model = result.model;
  } catch (err) {
    guard(err);
    sw.lap("write");
    warnings.push(`Technical detail: writing failed (${err instanceof LlmError ? err.message : reason(err)}).`);
    return ratedPartial("These cases were rated by Jev, but the written comparison and advice could not be produced this time.", "The written comparison and advice could not be produced.");
  }
  sw.lap("write");

  // 9. Validation, one bounded repair, then pruning.
  progress("validate", "Checking every historical claim against its sources");
  const outcome = await validateWithRepair({
    draft,
    bundles: shownBundles,
    jev,
    deadline,
    thresholds: config.thresholds,
    repair: (d, errors) => writer.repair(d, errors),
    onRepair: () => progress("repair", "Repairing items that failed checks"),
  });
  sw.lap("validate");
  if (cancelled()) throw new CancelledError();

  // 10. Assemble with backend-owned ratings and metadata.
  const roleOf = new Map(shown.map((s) => [s.ranked.candidate.case_id, s]));
  const built: Comparison[] = outcome.draft.comparisons
    .filter((item) => roleOf.has(item.case_id))
    .map((item) => {
      const s = roleOf.get(item.case_id)!;
      return buildComparison({ item, bundle: shownBundles.get(item.case_id)!, rating: s.ranked.rating, role: s.role, support: outcome.support });
    });
  const comparisons = built.filter((c) => c.role === "supporting");
  const challenging = built.find((c) => c.role === "challenging") ?? null;
  const challengingNote = challenge.caseId && !challenging ? "A challenging case was found, but its comparison did not pass the evidence checks." : challenge.note;
  const surviving = built.map((c) => shownBundles.get(c.case.case_id)!);

  if (!comparisons.length) {
    return insufficient(
      ctx,
      profile,
      "evidence_removed",
      "Relevant cases were found, but the written comparisons did not pass the evidence checks, so no advice is shown.",
      shown.map((s) => ({ case_id: s.ranked.candidate.case_id, title: s.ranked.candidate.title, analogy_fit: s.ranked.rating.analogy_fit, reasons: ["Comparison removed during validation"] })),
    );
  }

  const d = outcome.draft;
  const shared = {
    decision_summary: d.decision_summary,
    alternatives: d.conditional_alternatives.map((a) => ({ condition: a.condition, action: a.action, basis_case_ids: a.basis_case_ids })),
    lesson_tension: d.lesson_tension,
    comparisons,
    challenging,
    challenging_note: challengingNote,
    next_steps: d.next_steps,
    what_would_change: buildChangeConditions(d.what_would_change),
    uncertainties: [...new Set([...d.uncertainties, ...d.unknowns])].slice(0, 8),
    source_conflicts: d.source_conflicts,
    validation: outcome.report,
  };
  const enrichedProfile = { ...profile, assumptions: [...new Set([...profile.assumptions, ...d.assumptions])].slice(0, 8) };

  if (outcome.recommendationRemoved) {
    return {
      ...base(ctx, enrichedProfile, surviving),
      ...emptyPartial(),
      ...shared,
      status: "partial",
      preview: false,
      message: "The comparisons below passed the evidence checks, but the recommendation did not, so it has been removed.",
      missing: [{ part: "advice", reason: "The recommendation depended on material that failed validation." }],
      ranking_status: "ok",
      recommendation: null,
    };
  }
  return {
    ...base(ctx, enrichedProfile, surviving),
    ...shared,
    status: "ready",
    recommendation: { ...d.recommendation, kind: "modern_inference" },
  };
}
