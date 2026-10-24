"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import type { AnalogyRating, CaseCard, Comparison, PassageView, SourceView } from "@/lib/contracts/advice";
import { brief, claimNumbers } from "@/lib/case-refs";
import { BulletList, Button, cx } from "../ui";
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
          className="rounded-sm px-0.5 font-medium text-burgundy/80 hover:bg-burgundy-wash hover:text-burgundy"
          aria-label={`Show source passage ${refs[id] ?? ""}`}
        >
          [{refs[id] ?? "?"}]
        </button>
      ))}
    </span>
  );
}

function Block({ label, tone, children }: { label: string; tone?: "lesson"; children: ReactNode }) {
  return (
    <div className={cx(tone === "lesson" && "rounded-lg bg-burgundy-wash/40 px-4 py-3 md:-my-3")}>
      <p className={cx("mb-1.5 text-[0.68rem] font-semibold tracking-[0.14em] uppercase", tone === "lesson" ? "text-burgundy" : "text-muted")}>{label}</p>
      <div className={cx("leading-relaxed", tone === "lesson" ? "font-serif text-[1.12rem] text-ink" : "text-ink-soft")}>{children}</div>
    </div>
  );
}

export function StoryLink({ caseId }: { caseId: string }) {
  return (
    <Link href={`/cases/${encodeURIComponent(caseId)}`} className="text-sm font-medium text-burgundy underline decoration-burgundy/30 underline-offset-4 hover:decoration-burgundy">
      Read the full story →
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
    <article className="relative animate-rise rounded-xl border border-rule bg-card p-6 shadow-[0_18px_48px_-28px_rgb(29_26_22/0.35)] sm:p-8" aria-label={card.title}>
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 rounded-md px-2 py-1 text-2xl leading-none text-muted hover:bg-paper-deep hover:text-ink sm:top-5 sm:right-5"
        aria-label="Close details"
      >
        ×
      </button>
      <div className="flex flex-col gap-3 pr-8 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:pr-12">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.14em] text-bronze uppercase">
            {card.date_detail} · {ROLE_LABEL[role]}
          </p>
          <h3 className="mt-1.5 font-serif text-[clamp(1.5rem,2.6vw,2.1rem)] leading-tight text-ink">{card.title}</h3>
          <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-muted italic">{card.decision_question}</p>
        </div>
        {rating ? (
          <div className="-ml-2 shrink-0 self-start sm:ml-0">
            <FitRatingButton rating={rating} open={fitOpen} onToggle={() => setFitOpen(!fitOpen)} controls={fitId} />
          </div>
        ) : null}
      </div>
      {rating && fitOpen ? (
        <div className="mt-4">
          <FitBreakdown rating={rating} id={fitId} />
        </div>
      ) : null}
      {note ? <p className="mt-3 text-xs font-medium text-amber">{note}</p> : null}

      <div className="mt-7 grid gap-6 md:grid-cols-3">
        <Block label="What they did">
          {brief(card.chosen_action.text, 280)}
          <ClaimRefs ids={card.chosen_action.claim_ids} card={card} onOpen={onOpen} refs={refs} />
        </Block>
        <Block label="What happened">
          {brief(card.outcome.text, 280)}
          <ClaimRefs ids={card.outcome.claim_ids} card={card} onOpen={onOpen} refs={refs} />
        </Block>
        {lesson ? (
          <Block label={comparison?.lesson ? "The lesson for you" : "The lesson"} tone="lesson">
            {lesson}
          </Block>
        ) : (
          <Block label="Before the decision">{brief(card.context.text, 280)}</Block>
        )}
      </div>

      {comparison ? (
        <div className="mt-7 grid gap-6 border-t border-rule-soft pt-6 md:grid-cols-2">
          <Block label="Why it resembles your decision">
            <p className="text-ink">{comparison.shared_mechanism}</p>
            {comparison.applies_when ? <p className="mt-2 text-sm">Holds when {comparison.applies_when.charAt(0).toLowerCase() + comparison.applies_when.slice(1)}</p> : null}
          </Block>
          <Block label="Where it differs">
            <BulletList items={comparison.important_differences} className="text-[0.95rem]" />
          </Block>
        </div>
      ) : null}

      {comparison && (comparison.historical_points.length || comparison.quotes.length) ? (
        <details className="group mt-6 border-t border-rule-soft pt-4">
          <summary className="cursor-pointer list-none text-sm font-medium text-ink-soft hover:text-ink">
            <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span> From the record ({comparison.historical_points.length} sourced{" "}
            {comparison.historical_points.length === 1 ? "point" : "points"})
          </summary>
          <ul className="mt-3 space-y-2">
            {comparison.historical_points.map((p, i) => (
              <li key={i} className="text-[0.95rem] leading-relaxed text-ink-soft">
                {p.text}
                <ClaimRefs ids={p.claim_ids} card={card} onOpen={onOpen} refs={refs} />
                {p.support === "supported" ? <span className="ml-1.5 text-[0.7rem] text-moss">✓ checked against passage</span> : null}
              </li>
            ))}
          </ul>
          {comparison.quotes.map((q) => {
            const source = sources.find((s) => s.source_id === passages.find((p) => p.passage_id === q.passage_id)?.source_id);
            return (
              <figure key={q.passage_id + q.text} className="mt-4 border-l-2 border-burgundy/40 pl-4">
                <blockquote className="font-serif text-[1.05rem] leading-relaxed text-ink italic">“{q.text}”</blockquote>
                {source ? <figcaption className="mt-1 text-xs text-muted">{source.title}</figcaption> : null}
              </figure>
            );
          })}
        </details>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <StoryLink caseId={card.case_id} />
        <Button variant="secondary" onClick={() => onOpen(card, undefined, refs)}>
          Sources and passages
        </Button>
      </div>
    </article>
  );
}
