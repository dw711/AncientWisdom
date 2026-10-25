"use client";

import Link from "next/link";
import { useRef, ViewTransition, type CSSProperties, type ReactNode } from "react";
import type { CaseCard, ClaimView, PassageView, SourceView } from "@/lib/contracts/advice";
import { formatYear, headlineTransition } from "@/lib/case-refs";
import { BulletList } from "../ui";
import { gsap, MOTION_OK, useGSAP } from "../precedent/gsap";
import { ROLE_KICKER, type Edition } from "../precedent/model";
import { FitBars } from "./fit-rating";
import { NoteRef, type Note } from "./sidenote";

export type OpenSources = (card: CaseCard, claimId?: string, refs?: Record<string, number>) => void;

export function StoryLink({ caseId }: { caseId: string }) {
  return (
    <Link href={`/cases/${encodeURIComponent(caseId)}`} className="label text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
      Read the full story →
    </Link>
  );
}

interface Story {
  headline: string;
  body: ReactNode;
  /** A reading of what happened rather than a sourced statement. */
  interpretation: boolean;
}

/**
 * One newspaper column per historical case. It "prints" story by story with a
 * top-down wipe when it scrolls into view; its coloured bar stays pinned while
 * the column is being read.
 */
export function EditionColumn({
  edition: e,
  claims,
  passages,
  sources,
  onOpen,
  delay = 0,
}: {
  edition: Edition;
  claims: ClaimView[];
  passages: PassageView[];
  sources: SourceView[];
  onOpen: OpenSources;
  delay?: number;
}) {
  const root = useRef<HTMLElement>(null);
  const c = e.comparison;
  const card = e.card;

  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        gsap
          .timeline({ delay, scrollTrigger: { trigger: root.current, start: "top 78%" } })
          .fromTo("[data-bar]", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.6, ease: "power3.inOut" })
          .fromTo("[data-letter]", { yPercent: 40, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.8, ease: "power4.out" }, "-=0.2")
          .fromTo("[data-byline]", { opacity: 0 }, { opacity: 1, duration: 0.4 }, "<0.1")
          .fromTo("[data-story]", { clipPath: "inset(0 0 100% 0)", y: -6 }, { clipPath: "inset(0 0 0% 0)", y: 0, duration: 0.7, ease: "power2.inOut", stagger: 0.16 }, "-=0.2")
          .fromTo("[data-press-rule]", { scaleX: 0 }, { scaleX: 1, transformOrigin: "0 50%", duration: 0.5, stagger: 0.16 }, "<0.2");
      });
    },
    { scope: root, dependencies: [e.id], revertOnUpdate: true },
  );

  const note = (claimId: string): Note => {
    const claim = claims.find((x) => x.claim_id === claimId);
    const passage = passages.find((p) => p.passage_id === claim?.passage_ids[0]);
    return {
      n: e.refs[claimId] ?? "?",
      text: passage?.text ?? claim?.statement ?? "",
      source: sources.find((s) => s.source_id === passage?.source_id)?.title ?? null,
    };
  };
  const refs = (ids: string[]) =>
    ids.length ? (
      <span className="ml-0.5 inline-flex flex-wrap gap-0.5 align-super font-mono text-[0.66rem] leading-none">
        {ids.map((id) => (
          <NoteRef key={id} note={note(id)} onOpen={() => onOpen(card, id, e.refs)} />
        ))}
      </span>
    ) : null;

  const stories: Story[] = [
    {
      headline: card.title,
      body: (
        <>
          {card.context.text}
          {refs(card.context.claim_ids)}
        </>
      ),
      interpretation: false,
    },
    {
      headline: "What they did",
      body: (
        <>
          {card.chosen_action.text}
          {refs(card.chosen_action.claim_ids)}
        </>
      ),
      interpretation: false,
    },
    {
      headline: "What happened",
      body: (
        <>
          {card.outcome.text}
          {refs(card.outcome.claim_ids)}
          {card.outcome.uncertainty ? <span className="mt-2 block text-left text-sm text-muted italic">{card.outcome.uncertainty}</span> : null}
        </>
      ),
      interpretation: false,
    },
  ];
  if (e.lesson) stories.push({ headline: c?.lesson ? "The lesson for you" : "The lesson", body: <span className="italic">{e.lesson}</span>, interpretation: true });

  return (
    <section
      ref={root}
      id={`edition-${e.letter.toLowerCase()}`}
      aria-labelledby={`edition-${e.letter}-h`}
      // Bottom padding gives the pinned bar empty space to come to rest on.
      className="min-w-0 scroll-mt-20 pb-12"
      style={{ "--ed": e.color } as CSSProperties}
    >
      <h2
        id={`edition-${e.letter}-h`}
        data-bar
        className="label sticky top-16 z-10 flex items-center justify-between gap-3 bg-[var(--ed)] px-3 py-2 text-[12px] whitespace-nowrap text-paper"
      >
        <span className="truncate">
          Edition {e.letter} — {ROLE_KICKER[e.role]}
        </span>
        <span className="shrink-0">{formatYear(card.year_start)}</span>
      </h2>
      <div className="flex items-end gap-4 border-b border-ink pt-4 pb-4">
        <span aria-hidden="true" data-letter className="outline-letter shrink-0 font-display text-[96px] leading-[0.78] font-black">
          {e.letter}
        </span>
        <p data-byline className="text-[15px] leading-snug text-ink italic">
          “{card.decision_question}”
        </p>
      </div>
      {e.note ? <p className="label mt-3 text-amber">{e.note}</p> : null}

      <ol>
        {stories.map((s, i) => {
          const heading = (
            <h3
              id={`${e.id}-s${i}`}
              className={"font-display font-black tracking-[-0.02em] text-ink " + (i === 0 ? "text-[32px] leading-[1.02] md:text-[38px]" : "text-[24px] leading-[1.1]")}
            >
              {s.headline}
            </h3>
          );
          return (
            <li key={i}>
              <article data-story aria-labelledby={`${e.id}-s${i}`} className="py-6">
                <p className="label mb-2 flex flex-wrap gap-x-3 text-muted">
                  <span className="text-[var(--ed)]">No. {String(i + 1).padStart(2, "0")}</span>
                  {i === 0 ? <span>{card.date_detail}</span> : null}
                  {s.interpretation ? <span title="A reading of what happened, not a recorded fact">◇ Interpretation</span> : null}
                </p>
                {i === 0 ? (
                  // Morphs into the story page's headline on "Read the full story".
                  <ViewTransition name={headlineTransition(card.case_id)} share="headline" default="none">
                    {heading}
                  </ViewTransition>
                ) : (
                  heading
                )}
                <p
                  className={
                    "column-copy mt-3 text-[17px] leading-[1.55] text-ink/90 " +
                    (i === 0 ? "first-letter:float-left first-letter:mt-1 first-letter:mr-1.5 first-letter:font-display first-letter:text-[3.6em] first-letter:leading-[0.8] first-letter:font-black" : "")
                  }
                >
                  {s.body}
                </p>
              </article>
              {i < stories.length - 1 ? <hr data-press-rule className="border-0 border-t border-ink/35" /> : null}
            </li>
          );
        })}
      </ol>

      {e.rating ? <FitBars rating={e.rating} color={e.color} id={e.id} /> : null}

      {c ? (
        <aside className="mt-8 border border-ink p-4">
          <p className="label mb-2 text-ink">Why it resembles your letter</p>
          <p className="leading-relaxed text-ink">{c.shared_mechanism}</p>
          <p className="label mt-4 mb-2 text-ink">Where it differs</p>
          <BulletList items={c.important_differences} className="text-[0.95rem] text-ink-soft" />
        </aside>
      ) : null}

      {c && (c.historical_points.length || c.quotes.length) ? (
        <details className="group mt-6 border-t border-ink/35 pt-4">
          <summary className="label cursor-pointer list-none text-ink-soft hover:text-ink">
            <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span> From the record ({c.historical_points.length} sourced{" "}
            {c.historical_points.length === 1 ? "point" : "points"})
          </summary>
          <ul className="mt-3 space-y-2">
            {c.historical_points.map((p, i) => (
              <li key={i} className="text-[0.95rem] leading-relaxed text-ink-soft">
                {p.text}
                {refs(p.claim_ids)}
                {p.support === "supported" ? <span className="ml-1.5 font-mono text-[0.66rem] text-moss">✓ checked against passage</span> : null}
              </li>
            ))}
          </ul>
          {c.quotes.map((q) => {
            const source = sources.find((s) => s.source_id === passages.find((p) => p.passage_id === q.passage_id)?.source_id);
            return (
              <figure key={q.passage_id + q.text} className="mt-4 border-l-2 border-[var(--ed)] pl-4">
                <blockquote className="leading-relaxed text-ink italic">“{q.text}”</blockquote>
                {source ? <figcaption className="label mt-1 text-muted">{source.title}</figcaption> : null}
              </figure>
            );
          })}
        </details>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <StoryLink caseId={card.case_id} />
        <button type="button" onClick={() => onOpen(card, undefined, e.refs)} className="label border border-ink px-3 py-1.5 text-ink hover:bg-ink hover:text-paper">
          Sources and passages
        </button>
      </div>
    </section>
  );
}
