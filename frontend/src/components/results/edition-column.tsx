"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import type { CaseCard, PassageView, SourceView } from "@/lib/contracts/advice";
import { BulletList } from "../ui";
import { gsap, MOTION_OK, useGSAP } from "../precedent/gsap";
import { ROLE_KICKER, type Edition } from "../precedent/model";
import { FitBars } from "./fit-rating";

export type OpenSources = (card: CaseCard, claimId?: string, refs?: Record<string, number>) => void;

export function StoryLink({ caseId }: { caseId: string }) {
  return (
    <Link href={`/cases/${encodeURIComponent(caseId)}`} className="label text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
      Read the full story →
    </Link>
  );
}

function ClaimRefs({ ids, edition, onOpen }: { ids: string[]; edition: Edition; onOpen: OpenSources }) {
  if (!ids.length) return null;
  return (
    <span className="ml-0.5 inline-flex flex-wrap gap-0.5 align-super font-mono text-[0.66rem] leading-none">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onOpen(edition.card, id, edition.refs)}
          className="px-0.5 text-muted hover:bg-ink hover:text-paper"
          aria-label={`Show source passage ${edition.refs[id] ?? ""}`}
        >
          [{edition.refs[id] ?? "?"}]
        </button>
      ))}
    </span>
  );
}

/** Story chips: whether the story is a sourced observation or an interpretation. */
function TypeChip({ interpretation }: { interpretation: boolean }) {
  return (
    <span
      className={"inline-flex items-center gap-1 rounded-full border border-ink/40 px-2 py-[3px] font-mono text-[10px] leading-none tracking-[1px] text-ink/75 uppercase " + (interpretation ? "border-dashed" : "")}
      title={interpretation ? "Interpretation: a reading of what happened, not a recorded fact" : "Observation: sourced statements of what happened"}
    >
      <span aria-hidden="true">{interpretation ? "◇" : "●"}</span>
      {interpretation ? "interpretation" : "observation"}
    </span>
  );
}

interface Story {
  kicker: string;
  headline: string;
  body: ReactNode;
  interpretation: boolean;
}

/**
 * One newspaper column per historical case. It "prints" story by story with a
 * top-down wipe when it scrolls into view.
 */
export function EditionColumn({
  edition: e,
  passages,
  sources,
  onOpen,
  delay = 0,
}: {
  edition: Edition;
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
          .fromTo("[data-byline]", { opacity: 0 }, { opacity: 1, duration: 0.4 }, "-=0.15")
          .fromTo("[data-story]", { clipPath: "inset(0 0 100% 0)", y: -6 }, { clipPath: "inset(0 0 0% 0)", y: 0, duration: 0.7, ease: "power2.inOut", stagger: 0.16 }, "-=0.1")
          .fromTo("[data-press-rule]", { scaleX: 0 }, { scaleX: 1, transformOrigin: "0 50%", duration: 0.5, stagger: 0.16 }, "<0.2");
      });
    },
    { scope: root, dependencies: [e.id], revertOnUpdate: true },
  );

  const stories: Story[] = [
    {
      kicker: "The situation",
      headline: card.title,
      body: (
        <>
          {card.context.text}
          <ClaimRefs ids={card.context.claim_ids} edition={e} onOpen={onOpen} />
        </>
      ),
      interpretation: false,
    },
    {
      kicker: "The decision",
      headline: "What they did",
      body: (
        <>
          {card.chosen_action.text}
          <ClaimRefs ids={card.chosen_action.claim_ids} edition={e} onOpen={onOpen} />
        </>
      ),
      interpretation: false,
    },
    {
      kicker: "Afterwards",
      headline: "What happened",
      body: (
        <>
          {card.outcome.text}
          <ClaimRefs ids={card.outcome.claim_ids} edition={e} onOpen={onOpen} />
          {card.outcome.uncertainty ? <span className="mt-2 block text-sm text-muted italic">{card.outcome.uncertainty}</span> : null}
        </>
      ),
      interpretation: false,
    },
  ];
  if (e.lesson) stories.push({ kicker: "Analysis", headline: c?.lesson ? "The lesson for you" : "The lesson", body: <span className="italic">{e.lesson}</span>, interpretation: true });

  return (
    <section ref={root} id={`edition-${e.letter.toLowerCase()}`} aria-labelledby={`edition-${e.letter}-h`} className="min-w-0 scroll-mt-20">
      <h2 id={`edition-${e.letter}-h`} data-bar className="label flex items-center justify-between gap-3 px-3 py-2 text-[12px] text-paper" style={{ background: e.color }}>
        <span>
          Edition {e.letter} — {ROLE_KICKER[e.role]}
        </span>
        <span className="truncate">{card.display_date}</span>
      </h2>
      <p data-byline className="flex items-center gap-3 border-b border-ink py-3">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full font-display text-white italic" style={{ background: e.color, fontSize: e.initials.length > 2 ? 13 : 16 }}>
          {e.initials}
        </span>
        <span className="text-[15px] leading-snug text-ink italic">“{card.decision_question}”</span>
      </p>
      {e.note ? <p className="label mt-3 text-amber">{e.note}</p> : null}

      <ol>
        {stories.map((s, i) => (
          <li key={s.kicker}>
            <article data-story aria-labelledby={`${e.id}-s${i}`} className="py-6">
              <p className="label mb-2 flex flex-wrap gap-x-3 text-muted">
                <span style={{ color: e.color }}>No. {String(i + 1).padStart(2, "0")}</span>
                <span>{s.kicker}</span>
                {i === 0 ? <span>{card.date_detail}</span> : null}
              </p>
              <h3
                id={`${e.id}-s${i}`}
                className={"font-display font-black tracking-[-0.02em] text-ink " + (i === 0 ? "text-[34px] leading-[1.02] md:text-[42px]" : "text-[26px] leading-[1.1]")}
              >
                {s.headline}
              </h3>
              <p
                className={
                  "mt-3 text-[17px] leading-[1.55] text-ink/90 " +
                  (i === 0 ? "first-letter:float-left first-letter:mt-1 first-letter:mr-1.5 first-letter:font-display first-letter:text-[3.6em] first-letter:leading-[0.8] first-letter:font-black" : "")
                }
              >
                {s.body}
              </p>
              <div className="mt-3">
                <TypeChip interpretation={s.interpretation} />
              </div>
            </article>
            {i < stories.length - 1 ? <hr data-press-rule className="border-0 border-t border-ink/35" /> : null}
          </li>
        ))}
      </ol>

      {e.rating ? <FitBars rating={e.rating} color={e.color} id={e.id} /> : null}

      {c ? (
        <aside className="mt-8 border border-ink p-4">
          <p className="label mb-2 text-ink">Why it resembles your letter</p>
          <p className="leading-relaxed text-ink">{c.shared_mechanism}</p>
          {c.applies_when ? <p className="mt-2 text-sm text-ink-soft">Holds when {c.applies_when.charAt(0).toLowerCase() + c.applies_when.slice(1)}</p> : null}
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
                <ClaimRefs ids={p.claim_ids} edition={e} onOpen={onOpen} />
                {p.support === "supported" ? <span className="ml-1.5 font-mono text-[0.66rem] text-moss">✓ checked against passage</span> : null}
              </li>
            ))}
          </ul>
          {c.quotes.map((q) => {
            const source = sources.find((s) => s.source_id === passages.find((p) => p.passage_id === q.passage_id)?.source_id);
            return (
              <figure key={q.passage_id + q.text} className="mt-4 border-l-2 pl-4" style={{ borderColor: e.color }}>
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
