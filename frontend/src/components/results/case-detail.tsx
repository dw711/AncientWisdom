"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import type { AnalogyRating, CaseCard, Comparison, PassageView, SourceView } from "@/lib/contracts/advice";
import { brief, claimNumbers } from "@/lib/case-refs";
import { ArrowLabel, BulletList, Button, CloseButton, Disclosure, Tag, cx } from "../ui";
import { FitBreakdown, FitRatingButton } from "./fit-rating";

export type OpenSources = (card: CaseCard, claimId?: string, refs?: Record<string, number>) => void;

function ClaimRefs({ ids, card, onOpen, refs }: { ids: string[]; card: CaseCard; onOpen: OpenSources; refs: Record<string, number> }) {
  if (!ids.length) return null;
  return (
    <span className="ml-0.5 inline-flex flex-wrap gap-0.5 align-super text-[0.7rem] leading-none">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onOpen(card, id, refs)}
          className="rounded-sm px-0.5 font-medium text-ink/60 hover:bg-highlight hover:text-ink"
          aria-label={`Show source passage ${refs[id] ?? ""}`}
        >
          [{refs[id] ?? "?"}]
        </button>
      ))}
    </span>
  );
}

/** One cell of the card's ruled grid: a bold label over light text. Cells stack on small screens. */
export function Cell({ label, tone, children }: { label: string; tone?: "lesson"; children: ReactNode }) {
  return (
    <div className={cx("border-t border-rule-soft p-5 first:border-t-0 sm:p-8 md:border-t-0 md:border-l md:first:border-l-0 lg:p-10", tone === "lesson" && "bg-highlight-wash")}>
      <p className="text-[0.8125rem] font-semibold text-ink">{label}</p>
      <div className={cx("mt-3 leading-relaxed", tone === "lesson" ? "text-[1.15rem] font-medium tracking-[-0.015em] text-ink" : "font-light text-ink-soft")}>{children}</div>
    </div>
  );
}

export function StoryLink({ caseId }: { caseId: string }) {
  return (
    <Link href={`/cases/${encodeURIComponent(caseId)}`} className="text-[0.95rem] font-medium text-ink">
      <ArrowLabel>Read the full story</ArrowLabel>
    </Link>
  );
}

const ROLE_LABEL = { supporting: "Supports the advice", challenging: "Challenges the advice", unrated: "Related case" } as const;

/**
 * Details for one historical moment, shown under the timeline. Works for a
 * full comparison or, when the analysis was partial, for the case alone.
 */
export function CaseDetail({
  card,
  comparison,
  rating,
  role,
  note,
  passages,
  sources,
  onOpen,
  onClose,
}: {
  card: CaseCard;
  comparison: Comparison | null;
  rating: AnalogyRating | null;
  role: "supporting" | "challenging" | "unrated";
  note?: string;
  passages: PassageView[];
  sources: SourceView[];
  onOpen: OpenSources;
  onClose: () => void;
}) {
  const [fitOpen, setFitOpen] = useState(false);
  const fitId = useId();
  const refs = claimNumbers(card, comparison?.historical_points.map((p) => p.claim_ids) ?? []);
  const lesson = comparison?.lesson || card.lesson.text || card.pattern;

  return (
    <article className="relative animate-rise rounded-2xl border border-rule-soft bg-card" aria-label={card.title}>
      <CloseButton onClick={onClose} className="absolute top-4 right-4 sm:top-6 sm:right-6" />
      <div className="p-5 sm:p-10">
        <div className="flex flex-col gap-6 pr-12 sm:flex-row sm:items-start sm:justify-between sm:gap-10 sm:pr-16">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-light text-ink-soft">
              <span>{card.date_detail}</span>
              <Tag tone={role === "challenging" ? "dark" : "outline"}>{ROLE_LABEL[role]}</Tag>
            </p>
            <h3 className="mt-4 text-[clamp(1.8rem,3.6vw,3rem)] leading-[1.02] font-semibold tracking-[-0.04em] text-ink">{card.title}</h3>
            <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed font-light text-ink-soft">{card.decision_question}</p>
          </div>
          {rating ? (
            <div className="shrink-0">
              <FitRatingButton rating={rating} open={fitOpen} onToggle={() => setFitOpen(!fitOpen)} controls={fitId} />
            </div>
          ) : null}
        </div>
        {rating && fitOpen ? (
          <div className="mt-6">
            <FitBreakdown rating={rating} id={fitId} />
          </div>
        ) : null}
        {note ? <p className="mt-4 text-sm text-amber">{note}</p> : null}
      </div>

      <div className="grid border-t border-rule-soft md:grid-cols-3">
        <Cell label="What they did">
          {brief(card.chosen_action.text, 280)}
          <ClaimRefs ids={card.chosen_action.claim_ids} card={card} onOpen={onOpen} refs={refs} />
        </Cell>
        <Cell label="What happened">
          {brief(card.outcome.text, 280)}
          <ClaimRefs ids={card.outcome.claim_ids} card={card} onOpen={onOpen} refs={refs} />
        </Cell>
        {lesson ? (
          <Cell label={comparison?.lesson ? "The lesson for you" : "The lesson"} tone="lesson">
            {lesson}
          </Cell>
        ) : (
          <Cell label="Before the decision">{brief(card.context.text, 280)}</Cell>
        )}
      </div>

      {comparison ? (
        <div className="grid border-t border-rule-soft md:grid-cols-2">
          <Cell label="Why it resembles your decision">
            <p className="text-ink">{comparison.shared_mechanism}</p>
            {comparison.applies_when ? <p className="mt-2 text-sm">Holds when {comparison.applies_when.charAt(0).toLowerCase() + comparison.applies_when.slice(1)}</p> : null}
          </Cell>
          <Cell label="Where it differs">
            <BulletList items={comparison.important_differences} />
          </Cell>
        </div>
      ) : null}

      {comparison && (comparison.historical_points.length || comparison.quotes.length) ? (
        <Disclosure
          title={
            <>
              From the record{" "}
              <span className="font-light text-muted">
                ({comparison.historical_points.length} sourced {comparison.historical_points.length === 1 ? "point" : "points"})
              </span>
            </>
          }
        >
          <ul>
            {comparison.historical_points.map((p, i) => (
              <li key={i} className="dots-b py-3 leading-relaxed font-light text-ink-soft">
                {p.text}
                <ClaimRefs ids={p.claim_ids} card={card} onOpen={onOpen} refs={refs} />
                {p.support === "supported" ? <span className="ml-2 text-xs font-normal text-moss">✓ checked against passage</span> : null}
              </li>
            ))}
          </ul>
          {comparison.quotes.map((q) => {
            const source = sources.find((s) => s.source_id === passages.find((p) => p.passage_id === q.passage_id)?.source_id);
            return (
              <figure key={q.passage_id + q.text} className="mt-6 border-l-2 border-ink pl-5">
                <blockquote className="text-[1.1rem] leading-relaxed font-light text-ink italic">“{q.text}”</blockquote>
                {source ? <figcaption className="mt-2 text-xs text-muted">{source.title}</figcaption> : null}
              </figure>
            );
          })}
        </Disclosure>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-rule-soft px-5 py-5 sm:px-10">
        <StoryLink caseId={card.case_id} />
        <Button variant="secondary" onClick={() => onOpen(card, undefined, refs)}>
          Sources and passages
        </Button>
      </div>
    </article>
  );
}
