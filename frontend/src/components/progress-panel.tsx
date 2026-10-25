"use client";

import type { ProgressStage } from "@/lib/contracts/advice";
import { cx } from "./ui";

export interface ProgressEntry {
  stage: ProgressStage;
  message: string;
}

/** Shows the stages the server actually reports, in order. No invented percentages. */
export function ProgressPanel({ entries, waitingFor }: { entries: ProgressEntry[]; waitingFor: string | null }) {
  return (
    <div className="mx-auto max-w-2xl animate-rise py-10 text-center sm:py-16" aria-live="polite" aria-busy="true">
      <p className="eyebrow text-accent-ink">Working</p>
      <p className="display mt-5 text-[clamp(2.6rem,6vw,4.75rem)] leading-[0.95] text-ink italic">Reading the record</p>
      <ol className="mt-12 border-t border-rule text-left">
        {entries.map((e, i) => {
          const current = i === entries.length - 1;
          return (
            <li key={`${e.stage}-${i}`} className={cx("flex animate-rise items-center gap-5 border-b border-rule-soft py-4 transition-colors duration-500", current ? "text-ink" : "text-muted")}>
              <span className="display w-7 shrink-0 text-lg italic tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex-1">
                {e.message}
                {current ? <span className="sr-only"> (in progress)</span> : <span className="sr-only"> (done)</span>}
              </span>
              <span aria-hidden="true" className={cx("size-2 shrink-0 rounded-full", current ? "animate-breathe bg-accent" : "bg-ink/50")} />
            </li>
          );
        })}
        {!entries.length ? (
          <li className="flex items-center gap-5 border-b border-rule-soft py-4 text-ink">
            <span className="display w-7 shrink-0 text-lg italic tabular-nums">01</span>
            <span className="flex-1">{waitingFor ?? "Sending your description"}</span>
            <span aria-hidden="true" className="size-2 shrink-0 animate-breathe rounded-full bg-accent" />
          </li>
        ) : null}
      </ol>
      <p className="mt-8 text-sm text-muted italic">The answer appears only once every claim in it has been checked.</p>
    </div>
  );
}
