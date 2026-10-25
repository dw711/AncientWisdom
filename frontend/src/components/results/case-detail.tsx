"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import type { AnalogyRating, CaseCard, Comparison, PassageView, SourceView } from "@/lib/contracts/advice";
import { brief, claimNumbers } from "@/lib/case-refs";
import { BulletList, Button } from "../ui";
import { FitBreakdown, FitRatingButton } from "./fit-rating";

export type OpenSources = (card: CaseCard, claimId?: string, refs?: Record<string, number>) => void;

function ClaimRefs({ ids, card, onOpen, refs }: { ids: string[]; card: CaseCard; onOpen: OpenSources; refs: Record<string, number> }) {
  if (!ids.length) return null;
  return (
    <span className="ml-0.5 inline-flex flex-wrap gap-0.5 align-super font-mono text-[0.68rem] leading-none">
      {ids.map((id) => (
        <button key={id} type="button" onClick={() => onOpen(card, id, refs)} className="px-0.5 text-muted hover:bg-ink hover:text-paper" aria-label={`Show source passage ${refs[id] ?? ""}`}>
          [{refs[id] ?? "?"}]
        </button>
      ))}
    </span>
  );
}

function Block({ label, children, color }: { label: string; children: ReactNode; color?: string }) {
  return (
    <div className="border-t border-ink/15 pt-3">
      <p className="label mb-2" style={{ color: color ?? "var(--color-muted)" }}>
        {label}
      </p>
      <div className="leading-relaxed text-ink-soft">{children}</div>
    </div>
  );
}

export function StoryLink({ caseId }: { caseId: string }) {
  return (
    <Link href={`/cases/${encodeURIComponent(caseId)}`} className="label text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
      Read the full story →
    </Link>
  );
}

const ROLE_LABEL = { supporting: "Supports the advice", challenging: "Challenges the advice", unrated: "Related case" } as const;

/**
 * One historical path in full. Works for a full comparison or, when the
 * analysis was partial, for the case alone.
 */
export function CaseDetail({
  card,
  comparison,
  rating,
  role,
  note,
  color = "#14120F",
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
  color?: string;
  passages: PassageView[];
  sources: SourceView[];
  onOpen: OpenSources;
  onClose?: () => void;
}) {
  const [fitOpen, setFitOpen] = useState(false);
  const fitId = useId();
  const refs = claimNumbers(card, comparison?.historical_points.map((p) => p.claim_ids) ?? []);
  const lesson = comparison?.lesson || card.lesson.text || card.pattern;

  return (
    <article className="relative border border-ink/15 bg-card p-6 sm:p-8" style={{ boxShadow: `inset 4px 0 0 ${color}` }} aria-label={card.title}>
      {onClose ? (
        <button type="button" onClick={onClose} className="absolute top-3 right-3 px-2 py-1 text-2xl leading-none text-muted hover:text-ink" aria-label="Close details">
          ×
        </button>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <p className="label" style={{ color }}>
            {card.date_detail} · {ROLE_LABEL[role]}
          </p>
          <h3 className="mt-2 font-serif text-[clamp(1.6rem,2.8vw,2.3rem)] leading-tight text-ink">{card.title}</h3>
          <p className="mt-3 max-w-2xl font-serif text-[1.1rem] leading-relaxed text-ink-soft italic">“{card.decision_question}”</p>
        </div>
        {rating ? (
          <div className="shrink-0">
            <FitRatingButton rating={rating} open={fitOpen} onToggle={() => setFitOpen(!fitOpen)} controls={fitId} color={color} />
          </div>
        ) : null}
      </div>
      {rating && fitOpen ? (
        <div className="mt-5">
          <FitBreakdown rating={rating} id={fitId} color={color} />
        </div>
      ) : null}
      {note ? <p className="label mt-4 text-amber">{note}</p> : null}

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <Block label="What they did">
          {brief(card.chosen_action.text, 280)}
          <ClaimRefs ids={card.chosen_action.claim_ids} card={card} onOpen={onOpen} refs={refs} />
        </Block>
        <Block label="What happened">
          {brief(card.outcome.text, 280)}
          <ClaimRefs ids={card.outcome.claim_ids} card={card} onOpen={onOpen} refs={refs} />
        </Block>
        {lesson ? (
          <Block label={comparison?.lesson ? "The lesson for you" : "The lesson"} color={color}>
            <p className="font-serif text-[1.15rem] text-ink italic">{lesson}</p>
          </Block>
        ) : (
          <Block label="Before the decision">{brief(card.context.text, 280)}</Block>
        )}
      </div>

      {comparison ? (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
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
        <details className="group mt-6 border-t border-ink/15 pt-4">
          <summary className="label cursor-pointer list-none text-ink-soft hover:text-ink">
            <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span> From the record ({comparison.historical_points.length} sourced{" "}
            {comparison.historical_points.length === 1 ? "point" : "points"})
          </summary>
          <ul className="mt-3 space-y-2">
            {comparison.historical_points.map((p, i) => (
              <li key={i} className="text-[0.95rem] leading-relaxed text-ink-soft">
                {p.text}
                <ClaimRefs ids={p.claim_ids} card={card} onOpen={onOpen} refs={refs} />
                {p.support === "supported" ? <span className="ml-1.5 font-mono text-[0.68rem] text-moss">✓ checked against passage</span> : null}
              </li>
            ))}
          </ul>
          {comparison.quotes.map((q) => {
            const source = sources.find((s) => s.source_id === passages.find((p) => p.passage_id === q.passage_id)?.source_id);
            return (
              <figure key={q.passage_id + q.text} className="mt-4 border-l-2 pl-4" style={{ borderColor: color }}>
                <blockquote className="font-serif text-[1.05rem] leading-relaxed text-ink italic">“{q.text}”</blockquote>
                {source ? <figcaption className="label mt-1 text-muted">{source.title}</figcaption> : null}
              </figure>
            );
          })}
        </details>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <StoryLink caseId={card.case_id} />
        <Button variant="secondary" onClick={() => onOpen(card, undefined, refs)}>
          Sources and passages
        </Button>
      </div>
    </article>
  );
}
