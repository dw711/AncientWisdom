"use client";

import type { AnalogyRating } from "@/lib/contracts/advice";

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** The compact rating shown in a case header; toggles the full breakdown. */
export function FitRatingButton({ rating, open, onToggle, controls, color = "#14120F" }: { rating: AnalogyRating; open: boolean; onToggle: () => void; controls: string; color?: string }) {
  const sample = rating.source === "sample";
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={controls} className="group flex flex-col items-start text-left sm:items-end sm:text-right">
      <span className="font-serif text-[2.2rem] leading-none text-ink">
        {rating.analogy_fit}
        <span className="text-base text-muted">/100</span>
      </span>
      <span className="mt-2 block h-[3px] w-28 bg-ink/10" aria-hidden="true">
        <span className="block h-full" style={{ width: `${rating.analogy_fit}%`, background: color }} />
      </span>
      <span className="label mt-2 text-muted group-hover:text-ink">
        {sample ? "Sample fit" : "Analogy fit"} {open ? "▴" : "▾"}
      </span>
    </button>
  );
}

/** Per-dimension rubric levels as fit bars, with Jev confidence and the weighting note. */
export function FitBreakdown({ rating, id, color = "#14120F" }: { rating: AnalogyRating; id: string; color?: string }) {
  const sample = rating.source === "sample";
  return (
    <div id={id} className="animate-rise border-t border-ink/15 pt-4 text-left text-sm">
      <p className="label mb-3 text-ink">How close is this to you?</p>
      <p className="mb-4 max-w-3xl text-xs leading-relaxed text-ink-soft">
        A rubric rating of how closely this case&apos;s decision resembles yours, <strong className="font-semibold text-ink">not a probability that the advice will work</strong>.
        {sample ? " This sample rating was written for the preview; live ratings come from Jev." : " Each dimension is scored 0–4 by Jev on its pre-decision record, before outcomes are read."}
      </p>
      <dl className="grid gap-x-10 gap-y-4 md:grid-cols-2">
        {rating.dimensions.map((d) => {
          const level = Math.round(d.raw_score);
          return (
            <div key={d.dimension}>
              <dt className="flex items-baseline justify-between gap-3">
                <span className="text-ink">{d.label}</span>
                <span className="font-mono text-[11px] text-muted">
                  {d.raw_score.toFixed(d.raw_score % 1 ? 2 : 0)}/4 · weight {pct(rating.weights[d.dimension])}
                </span>
              </dt>
              <dd className="mt-1.5">
                <div className="h-[6px] w-full bg-ink/10" aria-hidden="true">
                  <div className="h-full" style={{ width: pct(d.normalised), background: color }} />
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{d.legend[String(level)]}</p>
                {d.confidence !== null ? (
                  <p className={d.confidence < 0.35 ? "mt-0.5 text-xs text-amber" : "mt-0.5 text-xs text-muted"}>
                    Jev confidence {pct(d.confidence)}
                    {d.confidence < 0.35 ? " (low; the rating is uncertain)" : ""}
                  </p>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
      {rating.critical_mismatch_probability !== null ? <p className="mt-3 text-xs text-muted">Chance Jev assigns to a critical mismatch: {pct(rating.critical_mismatch_probability)}</p> : null}
      <p className="mt-4 text-xs leading-relaxed text-muted">
        The weights are an application heuristic, not something Jev supplies. Model confidence describes the rating, not the reliability of the sources or the chance of success.
      </p>
    </div>
  );
}
