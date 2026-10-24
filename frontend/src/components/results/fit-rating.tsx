"use client";

import type { AnalogyRating } from "@/lib/contracts/advice";
import { cx } from "../ui";

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** The compact rating shown in a case header; toggles the full-width breakdown. */
export function FitRatingButton({ rating, open, onToggle, controls }: { rating: AnalogyRating; open: boolean; onToggle: () => void; controls: string }) {
  const sample = rating.source === "sample";
  return (
    <div className="text-right">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={controls}
        className="group inline-flex flex-col items-end rounded-md px-2 py-1 hover:bg-paper-deep"
      >
        <span className="font-serif text-[1.65rem] leading-none text-ink">
          {rating.analogy_fit}
          <span className="text-base text-muted">/100</span>
        </span>
        <span className="mt-1 text-[0.68rem] font-semibold tracking-[0.12em] text-muted uppercase group-hover:text-burgundy">
          {sample ? "Sample fit rating" : "Analogy fit"} {open ? "▴" : "▾"}
        </span>
      </button>
    </div>
  );
}

/** Per-dimension rubric levels, Jev confidence and the weighting note. */
export function FitBreakdown({ rating, id }: { rating: AnalogyRating; id: string }) {
  const sample = rating.source === "sample";
  return (
    <div id={id} className="animate-rise rounded-md border border-rule-soft bg-paper/70 p-4 text-left text-sm">
      <p className="mb-3 text-xs leading-relaxed text-ink-soft">
        A rubric rating of how closely this case&apos;s decision resembles yours, <strong className="font-semibold text-ink">not a probability that the advice will work</strong>.
        {sample ? " This sample rating was written for the preview; live ratings come from Jev." : " Each dimension is scored 0–4 by Jev on its pre-decision record, before outcomes are read."}
      </p>
      <dl className="space-y-3">
        {rating.dimensions.map((d) => {
          const level = Math.round(d.raw_score);
          return (
            <div key={d.dimension}>
              <dt className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-ink">{d.label}</span>
                <span className="font-mono text-xs text-muted">
                  {d.raw_score.toFixed(d.raw_score % 1 ? 2 : 0)}/4 · weight {pct(rating.weights[d.dimension])}
                </span>
              </dt>
              <dd className="mt-1">
                <div className="flex gap-1" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className={cx("h-1 flex-1 rounded-full", d.normalised * 4 > i ? "bg-bronze" : "bg-rule")} />
                  ))}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{d.legend[String(level)]}</p>
                {d.confidence !== null ? (
                  <p className={cx("mt-0.5 text-xs", d.confidence < 0.35 ? "text-amber" : "text-muted")}>
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
        <p className="mt-3 text-xs text-muted">Chance Jev assigns to a critical mismatch: {pct(rating.critical_mismatch_probability)}</p>
      ) : null}
      <p className="mt-3 border-t border-rule-soft pt-3 text-xs leading-relaxed text-muted">
        The weights are an application heuristic, not something Jev supplies. Model confidence describes the rating, not the reliability of the sources or the chance of success.
      </p>
    </div>
  );
}
