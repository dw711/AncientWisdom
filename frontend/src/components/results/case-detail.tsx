"use client";

import Link from "next/link";
import { useId, useState, type CSSProperties, type ReactNode } from "react";
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
          className="rounded-sm px-0.5 font-semibold text-accent-ink transition-colors hover:bg-highlight hover:text-ink"
          aria-label={`Show source passage ${refs[id] ?? ""}`}
        >
          [{refs[id] ?? "?"}]
        </button>
      ))}
    </span>
  );
}

/** One cell of the card's ruled grid: a small label over the text. Cells stack on small screens; `step` staggers their entrance. */
export function Cell({ label, tone, step = 0, children }: { label: string; tone?: "lesson"; step?: number; children: ReactNode }) {
  return (
    <div
      className={cx("stagger border-t border-rule-soft p-5 first:border-t-0 sm:p-8 md:border-t-0 md:border-l md:first:border-l-0 lg:p-10", tone === "lesson" && "bg-highlight-wash")}
      style={{ "--d": 120 + step * 110 } as CSSProperties}
    >
      <p className="eyebrow flex items-center gap-2.5 text-accent-ink">
        <span aria-hidden="true" className="h-px w-5 bg-accent" />
        {label}
      </p>
      <div className={cx("mt-4 leading-relaxed", tone === "lesson" ? "display text-[1.4rem] leading-[1.3] text-ink italic" : "text-ink-soft")}>{children}</div>
    </div>
  );
}

export function StoryLink({ caseId }: { caseId: string }) {
  return (
    <Link href={`/cases/${encodeURIComponent(caseId)}`} className="rounded-[2px] text-[0.95rem] font-semibold text-ink">
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
    <article className="relative animate-rise rounded-[6px] border border-rule-soft bg-card shadow-[0_40px_90px_-60px_rgb(20_14_6/0.45)]" aria-label={card.title}>
      <CloseButton onClick={onClose} className="absolute top-4 right-4 sm:top-6 sm:right-6" />
      <div className="p-5 sm:p-10">
        <div className="flex flex-col gap-6 pr-12 sm:flex-row sm:items-start sm:justify-between sm:gap-10 sm:pr-16">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
              <span>{card.date_detail}</span>
              <Tag tone={role === "challenging" ? "dark" : "outline"}>{ROLE_LABEL[role]}</Tag>
            </p>
            <h3 className="display mt-5 text-[clamp(2.1rem,4.2vw,3.6rem)] leading-[1] text-ink">{card.title}</h3>
            <p className="mt-5 max-w-2xl text-[1.1rem] leading-relaxed text-ink-soft">{card.decision_question}</p>
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
        <Cell label="What happened" step={1}>
          {brief(card.outcome.text, 280)}
          <ClaimRefs ids={card.outcome.claim_ids} card={card} onOpen={onOpen} refs={refs} />
        </Cell>
        {lesson ? (
          <Cell label={comparison?.lesson ? "The lesson for you" : "The lesson"} tone="lesson" step={2}>
            {lesson}
          </Cell>
        ) : (
          <Cell label="Before the decision" step={2}>{brief(card.context.text, 280)}</Cell>
        )}
      </div>

      {comparison ? (
        <div className="grid border-t border-rule-soft md:grid-cols-2">
          <Cell label="Why it resembles your decision" step={3}>
            <p className="text-ink">{comparison.shared_mechanism}</p>
            {comparison.applies_when ? <p className="mt-2 text-sm">Holds when {comparison.applies_when.charAt(0).toLowerCase() + comparison.applies_when.slice(1)}</p> : null}
          </Cell>
          <Cell label="Where it differs" step={4}>
            <BulletList items={comparison.important_differences} />
          </Cell>
        </div>
      ) : null}

      {comparison && (comparison.historical_points.length || comparison.quotes.length) ? (
        <Disclosure
          title={
            <>
              From the record{" "}
              <span className="font-normal text-muted">
                ({comparison.historical_points.length} sourced {comparison.historical_points.length === 1 ? "point" : "points"})
              </span>
            </>
          }
        >
          <ul>
            {comparison.historical_points.map((p, i) => (
              <li key={i} className="border-b border-rule-soft py-3.5 leading-relaxed text-ink-soft">
                {p.text}
                <ClaimRefs ids={p.claim_ids} card={card} onOpen={onOpen} refs={refs} />
                {p.support === "supported" ? <span className="ml-2 text-xs font-semibold text-moss">✓ checked against passage</span> : null}
              </li>
            ))}
          </ul>
          {comparison.quotes.map((q) => {
            const source = sources.find((s) => s.source_id === passages.find((p) => p.passage_id === q.passage_id)?.source_id);
            return (
              <figure key={q.passage_id + q.text} className="mt-7 border-l border-accent pl-6">
                <blockquote className="font-display text-[1.25rem] leading-relaxed text-ink italic">“{q.text}”</blockquote>
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
