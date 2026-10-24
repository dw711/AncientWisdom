"use client";

import { useState, type ReactNode } from "react";
import type { AdviceResponse, ConstraintKey, NeedsClarificationResponse, InsufficientEvidenceResponse } from "@/lib/contracts/advice";
import { BulletList, Button, Label, SectionHeading, Tag } from "../ui";
import { CaseTimeline, type TimelineItem } from "./case-timeline";
import { CaseOnlyCard, ComparisonCard, type OpenSources } from "./comparison-card";
import { ChangeSection, DecisionSection, NextStepsSection, RecommendationSection, SourceConflicts, ValidationFooter } from "./sections";

interface Props {
  response: AdviceResponse;
  changedLabel: string | null;
  busy: boolean;
  onOpenSources: OpenSources;
  onApplyChange: (key: ConstraintKey, value: string | number | boolean, label: string) => void;
  onEditContext: () => void;
  onClarify: (answers: { question: string; answer: string }[]) => void;
}

function Banner({ tone, title, children }: { tone: "sample" | "partial" | "changed"; title: string; children?: ReactNode }) {
  const styles = {
    sample: "border-bronze/30 bg-bronze-wash/70 text-ink",
    partial: "border-amber/30 bg-amber-wash text-ink",
    changed: "border-moss/25 bg-moss-wash text-ink",
  }[tone];
  return (
    <div role="status" className={`animate-rise rounded-lg border px-5 py-4 ${styles}`}>
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-1 text-sm leading-relaxed text-ink-soft">{children}</div> : null}
    </div>
  );
}

export function ResultsView(p: Props) {
  const r = p.response;

  if (r.status === "needs_clarification") return <ClarificationPanel response={r} onSubmit={p.onClarify} busy={p.busy} />;
  if (r.status === "insufficient_evidence") return <InsufficientPanel response={r} onEditContext={p.onEditContext} />;

  const partial = r.status === "partial" ? r : null;
  const recommendation = r.recommendation;
  const comparisons = r.comparisons;
  const hasCases = comparisons.length > 0 || Boolean(partial?.rated_cases.length) || Boolean(partial?.unranked_cases.length);
  const timeline: TimelineItem[] = [
    ...comparisons.map((c) => ({ card: c.case, role: c.role, lesson: c.lesson || null })),
    ...(r.challenging ? [{ card: r.challenging.case, role: "challenging" as const, lesson: r.challenging.lesson || null }] : []),
    ...(partial?.rated_cases.map((c) => ({ card: c.case, role: c.role, lesson: null })) ?? []),
    ...(partial?.unranked_cases.map((card) => ({ card, role: "unrated" as const, lesson: null })) ?? []),
  ];

  return (
    <div className="space-y-14">
      <div className="space-y-3">
        {p.changedLabel ? (
          <Banner tone="changed" title={`Fresh analysis with your change: ${p.changedLabel}`}>
            The decision profile, case ranking and advice were all recomputed from the updated inputs.
          </Banner>
        ) : null}
        {r.sample ? (
          <Banner tone="sample" title="Sample analysis">
            This example was prepared in advance from the reviewed collection, and its fit ratings are illustrative. Your own descriptions are analysed in live mode.
          </Banner>
        ) : null}
        {partial ? (
          <Banner tone="partial" title={partial.preview ? "Preview mode" : "Partial result"}>
            <p>{partial.message}</p>
            {!partial.preview && partial.missing.length ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {partial.missing.map((m, i) => (
                  <li key={i}>{m.reason}</li>
                ))}
              </ul>
            ) : null}
          </Banner>
        ) : null}
      </div>

      <DecisionSection summary={r.decision_summary} profile={r.profile} onEditContext={p.onEditContext} />

      {recommendation ? <RecommendationSection recommendation={recommendation} alternatives={r.alternatives} tension={r.lesson_tension} /> : null}

      {hasCases ? (
        <section aria-labelledby="sec-cases" className="space-y-6">
          <SectionHeading
            id="sec-cases"
            numeral="III"
            title="Historical comparisons"
            aside={comparisons.length ? `${comparisons.length} ${comparisons.length === 1 ? "case" : "cases"} · fit is a rubric rating, not a probability of success` : null}
          />
          <CaseTimeline items={timeline} />
          <SourceConflicts conflicts={r.source_conflicts} />
          {comparisons.map((c) => (
            <ComparisonCard key={c.case.case_id} comparison={c} onOpen={p.onOpenSources} passages={r.passages} sources={r.sources} />
          ))}
          {partial?.rated_cases
            .filter((c) => c.role === "supporting")
            .map((c) => (
              <CaseOnlyCard key={c.case.case_id} card={c.case} rating={c.rating} onOpen={p.onOpenSources} note="Rated by Jev. The written comparison is unavailable for this result." />
            ))}
          {partial?.unranked_cases.map((c) => (
            <CaseOnlyCard
              key={c.case_id}
              card={c}
              rating={null}
              onOpen={p.onOpenSources}
              note={partial.preview ? "Shares wording with your description. Not assessed for fit." : "Not rated: the analogy assessment was unavailable."}
            />
          ))}
        </section>
      ) : null}

      {!partial?.preview && (comparisons.length || partial?.rated_cases.length) ? (
        <section aria-labelledby="sec-challenge" className="space-y-5">
          <SectionHeading id="sec-challenge" numeral="IV" title="A challenging case" />
          {r.challenging ? (
            <ComparisonCard comparison={r.challenging} onOpen={p.onOpenSources} passages={r.passages} sources={r.sources} />
          ) : partial?.rated_cases.find((c) => c.role === "challenging") ? (
            partial.rated_cases
              .filter((c) => c.role === "challenging")
              .map((c) => <CaseOnlyCard key={c.case.case_id} card={c.case} rating={c.rating} onOpen={p.onOpenSources} note="Selected as a challenging case. The written comparison is unavailable." />)
          ) : (
            <p className="rounded-md border border-dashed border-rule px-4 py-4 leading-relaxed text-ink-soft">{r.challenging_note ?? "No sufficiently relevant challenging case was found."}</p>
          )}
        </section>
      ) : null}

      <NextStepsSection steps={r.next_steps} />

      <ChangeSection items={r.what_would_change} uncertainties={r.uncertainties} onApply={p.onApplyChange} onEditContext={p.onEditContext} busy={p.busy} />

      <ValidationFooter validation={r.validation} versions={r.versions} requestId={r.request_id} sample={r.sample} warnings={r.warnings} />
    </div>
  );
}

function ClarificationPanel({ response, onSubmit, busy }: { response: NeedsClarificationResponse; onSubmit: Props["onClarify"]; busy: boolean }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const ready = response.questions.every((q) => (answers[q.id] ?? "").trim().length > 0);
  return (
    <section aria-labelledby="sec-clarify" className="animate-rise space-y-6">
      <SectionHeading id="sec-clarify" numeral="I" title="One thing first" />
      <p className="leading-relaxed text-ink-soft">
        {response.profile?.decision ? (
          <>
            We understood your decision as: <span className="font-serif text-ink">{response.profile.decision}</span>.{" "}
          </>
        ) : null}
        Before comparing it with historical cases, we need one more detail, because it would change what is worth recommending.
      </p>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onSubmit(response.questions.map((q) => ({ question: q.question, answer: answers[q.id].trim() })));
        }}
      >
        {response.questions.map((q) => (
          <label key={q.id} className="block">
            <span className="block font-serif text-lg text-ink">{q.question}</span>
            <span className="mt-1 block text-sm text-muted">{q.why_it_matters}</span>
            <textarea
              rows={2}
              maxLength={500}
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
              className="mt-2 block w-full rounded-md border border-rule bg-card px-3 py-2.5 text-ink focus:border-burgundy/60 focus:outline-none"
            />
          </label>
        ))}
        <Button type="submit" disabled={!ready || busy}>
          Continue with this answer
        </Button>
      </form>
    </section>
  );
}

function InsufficientPanel({ response, onEditContext }: { response: InsufficientEvidenceResponse; onEditContext: () => void }) {
  return (
    <section aria-labelledby="sec-nomatch" className="animate-rise space-y-6">
      <SectionHeading id="sec-nomatch" numeral="—" title={response.reason === "evidence_removed" ? "Not enough verified evidence" : "No close historical match"} />
      <p className="font-serif text-[1.25rem] leading-relaxed text-ink">{response.message}</p>
      <p className="leading-relaxed text-ink-soft">Rather than force a comparison, we are showing nothing. A weak analogy can mislead more than it helps.</p>
      {response.near_misses.length ? (
        <div>
          <Label>Closest cases considered</Label>
          <ul className="space-y-3">
            {response.near_misses.map((m) => (
              <li key={m.case_id} className="rounded-md border border-rule-soft bg-card px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium text-ink">{m.title}</p>
                  {m.analogy_fit !== null ? <Tag>{m.analogy_fit}/100</Tag> : null}
                </div>
                <BulletList items={m.reasons} className="mt-1.5 text-sm text-ink-soft" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <Label>What might help</Label>
        <BulletList items={response.suggestions} className="text-ink-soft" />
      </div>
      <Button variant="secondary" onClick={onEditContext}>
        Edit your description
      </Button>
      <p className="font-mono text-[0.68rem] text-muted">
        {response.request_id} · corpus {response.versions.corpus} · {response.versions.rubric}
        {response.versions.jev_model ? ` · ${response.versions.jev_model}` : ""}
      </p>
    </section>
  );
}
