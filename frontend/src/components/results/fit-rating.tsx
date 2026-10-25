"use client";

import type { CSSProperties } from "react";
import type { AnalogyRating } from "@/lib/contracts/advice";
import { cx } from "../ui";

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** The score shown in a case header, with its bar; toggles the full-width breakdown. */
export function FitRatingButton({ rating, open, onToggle, controls }: { rating: AnalogyRating; open: boolean; onToggle: () => void; controls: string }) {
  const sample = rating.source === "sample";
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={controls} className="group flex flex-col items-start text-left sm:items-end sm:text-right">
      <span className="eyebrow text-muted">{sample ? "Sample fit rating" : "Analogy fit"}</span>
      <span className="display mt-2 text-[3.5rem] leading-none text-ink tabular-nums">
        {rating.analogy_fit}
        <span className="ml-1 font-sans text-base tracking-normal text-muted">/100</span>
      </span>
      <span aria-hidden="true" className="mt-3 block h-px w-32 bg-rule">
        <span className="tl-axis block h-full bg-accent" style={{ width: `${rating.analogy_fit}%`, animationDuration: "700ms", "--d": 300 } as CSSProperties} />
      </span>
      <span className="mt-3 text-[0.8125rem] font-semibold text-ink underline decoration-accent/50 decoration-1 underline-offset-[5px] transition-[text-decoration-color] group-hover:decoration-ink">
        {open ? "Hide how it was rated" : "How it was rated"}
      </span>
    </button>
  );
}

/** Per-dimension rubric levels, Jev confidence and the weighting note. */
export function FitBreakdown({ rating, id }: { rating: AnalogyRating; id: string }) {
  const sample = rating.source === "sample";
  return (
    <div id={id} className="animate-rise rounded-[4px] border border-rule-soft bg-paper p-5 text-left text-sm sm:p-8">
      <p className="mb-2 max-w-3xl leading-relaxed text-ink-soft">
        A rubric rating of how closely this case&apos;s decision resembles yours, <strong className="font-semibold text-ink">not a probability that the advice will work</strong>.
        {sample ? " This sample rating was written for the preview; live ratings come from Jev." : " Each dimension is scored 0–4 by Jev on its pre-decision record, before outcomes are read."}
      </p>
      <dl className="grid gap-x-10 sm:grid-cols-2">
        {rating.dimensions.map((d) => {
          const level = Math.round(d.raw_score);
          return (
            <div key={d.dimension} className="border-b border-rule-soft py-4">
              <dt className="flex items-baseline justify-between gap-3">
                <span className="font-semibold text-ink">{d.label}</span>
                <span className="text-xs text-muted tabular-nums">
                  {d.raw_score.toFixed(d.raw_score % 1 ? 2 : 0)}/4 · weight {pct(rating.weights[d.dimension])}
                </span>
              </dt>
              <dd className="mt-2">
                <div className="flex gap-1" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className={cx("h-[3px] flex-1", d.normalised * 4 > i ? "bg-accent" : "bg-rule")} />
                  ))}
                </div>
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-soft">{d.legend[String(level)]}</p>
                {d.confidence !== null ? (
                  <p className={cx("mt-1 text-xs", d.confidence < 0.35 ? "text-amber" : "text-muted")}>
                    Jev confidence {pct(d.confidence)}
                    {d.confidence < 0.35 ? " (low; the rating is uncertain)" : ""}
                  </p>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
      {rating.critical_mismatch_probability !== null ? (
        <p className="mt-4 text-xs text-muted">Chance Jev assigns to a critical mismatch: {pct(rating.critical_mismatch_probability)}</p>
      ) : null}
      <p className="mt-3 text-xs leading-relaxed text-muted">
        The weights are an application heuristic, not something Jev supplies. Model confidence describes the rating, not the reliability of the sources or the chance of success.
      </p>
    </div>
  );
}
