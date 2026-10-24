"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { claimNumbers } from "@/lib/case-refs";
import type { AnalogyRating, CaseCard, Comparison, PassageView, SourceView } from "@/lib/contracts/advice";
import { BulletList, Button, Label, Tag, cx } from "../ui";
import { FitBreakdown, FitRatingButton } from "./fit-rating";

export type OpenSources = (card: CaseCard, claimId?: string, refs?: Record<string, number>) => void;

function ClaimRefs({ ids, card, onOpen, refs }: { ids: string[]; card: CaseCard; onOpen: OpenSources; refs: Record<string, number> }) {
  return (
    <span className="ml-0.5 inline-flex flex-wrap gap-0.5 align-super text-[0.7rem] leading-none">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onOpen(card, id, refs)}
          className="rounded-sm px-0.5 font-medium text-burgundy/80 hover:bg-burgundy-wash hover:text-burgundy"
          aria-label={`Show source passage ${refs[id] ?? ""}`}
          title="Show the supporting passage"
        >
          [{refs[id] ?? "?"}]
        </button>
      ))}
    </span>
  );
}

export function CaseHeader({ card, rating }: { card: CaseCard; rating: AnalogyRating | null }) {
  const [open, setOpen] = useState(false);
  const breakdownId = useId();
  return (
    <div>
      <div className="flex flex-col-reverse justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.14em] text-bronze uppercase">{card.display_date}</p>
          <h3 className="mt-1 font-serif text-[1.45rem] leading-snug text-ink">{card.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted italic">{card.decision_question}</p>
        </div>
        {rating ? (
          <div className="shrink-0 self-start sm:self-auto">
            <FitRatingButton rating={rating} open={open} onToggle={() => setOpen(!open)} controls={breakdownId} />
          </div>
        ) : null}
      </div>
      {rating && open ? (
        <div className="mt-4">
          <FitBreakdown rating={rating} id={breakdownId} />
        </div>
      ) : null}
    </div>
  );
}

function Context({ card, onOpen, refs }: { card: CaseCard; onOpen: OpenSources; refs: Record<string, number> }) {
  return (
    <div>
      <Label>Historical context</Label>
      <p className="leading-relaxed text-ink-soft">
        {card.context.text}
        <ClaimRefs ids={card.context.claim_ids} card={card} onOpen={onOpen} refs={refs} />
      </p>
    </div>
  );
}

function WhatHappened({ card, onOpen, refs }: { card: CaseCard; onOpen: OpenSources; refs: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-rule-soft pt-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="text-sm font-medium text-ink-soft hover:text-ink">
        {open ? "Hide" : "Show"} what was decided and what followed
      </button>
      {open ? (
        <div className="mt-3 space-y-3 text-[0.95rem] leading-relaxed text-ink-soft">
          <p>
            <span className="font-medium text-ink">What was decided. </span>
            {card.chosen_action.text}
            <ClaimRefs ids={card.chosen_action.claim_ids} card={card} onOpen={onOpen} refs={refs} />
          </p>
          <p>
            <span className="font-medium text-ink">What followed. </span>
            {card.outcome.text}
            <ClaimRefs ids={card.outcome.claim_ids} card={card} onOpen={onOpen} refs={refs} />
          </p>
          <p className="text-sm text-muted">{card.outcome.uncertainty}</p>
          <div>
            <Label>Where this analogy stops applying</Label>
            <BulletList items={card.analogy_limits} className="text-sm" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SourceLine({ card, sources }: { card: CaseCard; sources: SourceView[] }) {
  const names = card.source_ids.map((id) => sources.find((s) => s.source_id === id)).filter(Boolean) as SourceView[];
  if (!names.length) return null;
  const labels = names.map((s) => (s.institution || s.author || s.title).split(" (")[0]).filter((v, i, a) => a.indexOf(v) === i);
  return <p className="text-xs text-muted">Sources: {labels.join("; ")}</p>;
}

export function ComparisonCard({
  comparison,
  onOpen,
  passages,
  sources,
}: {
  comparison: Comparison;
  onOpen: OpenSources;
  passages: PassageView[];
  sources: SourceView[];
}) {
  const { case: card } = comparison;
  const challenging = comparison.role === "challenging";
  const refs = claimNumbers(card, comparison.historical_points.map((p) => p.claim_ids));
  return (
    <article
      className={cx(
        "animate-rise space-y-5 rounded-lg border bg-card p-5 sm:p-7",
        challenging ? "border-burgundy/30 shadow-[inset_3px_0_0_var(--color-burgundy)]" : "border-rule",
      )}
      aria-label={card.title}
    >
      {challenging ? <Tag tone="burgundy">Challenges the first lesson</Tag> : null}
      <CaseHeader card={card} rating={comparison.rating} />
      {comparison.rating.low_confidence ? (
        <p className="rounded-md bg-amber-wash px-3 py-2 text-sm text-amber">Jev was uncertain about part of this rating. Treat the fit as approximate.</p>
      ) : null}
      <Context card={card} onOpen={onOpen} refs={refs} />

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label>What it shares with your decision</Label>
          <p className="leading-relaxed text-ink">{comparison.shared_mechanism}</p>
        </div>
        <div>
          <Label>Important differences</Label>
          <BulletList items={comparison.important_differences} className="text-[0.95rem] text-ink-soft" />
        </div>
      </div>

      {comparison.lesson ? (
        <p className="rounded-md bg-paper-deep/60 px-4 py-3 leading-relaxed text-ink">
          <span className="mr-2 text-[0.7rem] font-semibold tracking-[0.14em] text-bronze uppercase">The lesson</span>
          {comparison.lesson}
        </p>
      ) : null}

      {comparison.applies_when ? (
        <p className="text-sm text-ink-soft">
          <span className="font-medium text-ink">The comparison holds when: </span>
          {comparison.applies_when}
        </p>
      ) : null}

      {comparison.historical_points.length ? (
        <div>
          <Label>From the record</Label>
          <ul className="space-y-2">
            {comparison.historical_points.map((p, i) => (
              <li key={i} className="text-[0.95rem] leading-relaxed text-ink-soft">
                {p.text}
                <ClaimRefs ids={p.claim_ids} card={card} onOpen={onOpen} refs={refs} />
                {p.support === "supported" ? (
                  <span className="ml-1.5 text-[0.7rem] text-moss" title={p.support_confidence !== null ? `Jev support check, confidence ${Math.round(p.support_confidence * 100)}%` : undefined}>
                    ✓ checked against passage
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {comparison.quotes.map((q) => {
        const passage = passages.find((p) => p.passage_id === q.passage_id);
        const source = sources.find((s) => s.source_id === passage?.source_id);
        return (
          <figure key={q.passage_id + q.text} className="border-l-2 border-burgundy/40 pl-4">
            <blockquote className="font-serif text-[1.08rem] leading-relaxed text-ink italic">“{q.text}”</blockquote>
            {source ? <figcaption className="mt-1 text-xs text-muted">{source.title}</figcaption> : null}
          </figure>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SourceLine card={card} sources={sources} />
        <div className="flex flex-wrap items-center gap-3">
          <StoryLink caseId={card.case_id} />
          <Button variant="secondary" onClick={() => onOpen(card, undefined, refs)}>
            Sources and passages
          </Button>
        </div>
      </div>
      <WhatHappened card={card} onOpen={onOpen} refs={refs} />
    </article>
  );
}

export function StoryLink({ caseId }: { caseId: string }) {
  return (
    <Link href={`/cases/${encodeURIComponent(caseId)}`} className="text-sm font-medium text-burgundy underline decoration-burgundy/30 underline-offset-4 hover:decoration-burgundy">
      Read the full story →
    </Link>
  );
}

/** A case shown without a written comparison (ranking or writing unavailable). */
export function CaseOnlyCard({ card, rating, onOpen, note }: { card: CaseCard; rating: AnalogyRating | null; onOpen: OpenSources; note: string }) {
  const refs = claimNumbers(card);
  return (
    <article className="animate-rise space-y-4 rounded-lg border border-rule bg-card p-5 sm:p-7" aria-label={card.title}>
      <CaseHeader card={card} rating={rating} />
      <p className="text-xs font-medium text-amber">{note}</p>
      <Context card={card} onOpen={onOpen} refs={refs} />
      <div className="flex flex-wrap items-center justify-end gap-3">
        <StoryLink caseId={card.case_id} />
        <Button variant="secondary" onClick={() => onOpen(card, undefined, refs)}>
          Sources and passages
        </Button>
      </div>
      <WhatHappened card={card} onOpen={onOpen} refs={refs} />
    </article>
  );
}
