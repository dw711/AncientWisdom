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
    <div className="mx-auto max-w-2xl animate-rise py-6 text-center sm:py-10" aria-live="polite" aria-busy="true">
      <p className="text-sm font-light text-ink-soft">Working</p>
      <p className="mt-3 text-[clamp(2.2rem,5vw,3.75rem)] leading-[0.95] font-semibold tracking-[-0.045em] text-ink">Reading the record</p>
      <ol className="mt-10 text-left">
        {entries.map((e, i) => {
          const current = i === entries.length - 1;
          return (
            <li key={`${e.stage}-${i}`} className={cx("dots-b flex items-center gap-5 py-4", current ? "text-ink" : "text-muted")}>
              <span className="w-6 shrink-0 text-sm tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex-1 font-light">
                {e.message}
                {current ? <span className="sr-only"> (in progress)</span> : <span className="sr-only"> (done)</span>}
              </span>
              <span aria-hidden="true" className={cx("size-2 shrink-0 rounded-full", current ? "animate-breathe bg-accent" : "bg-ink")} />
            </li>
          );
        })}
        {!entries.length ? (
          <li className="dots-b flex items-center gap-5 py-4 text-ink">
            <span className="w-6 shrink-0 text-sm tabular-nums">01</span>
            <span className="flex-1 font-light">{waitingFor ?? "Sending your description"}</span>
            <span aria-hidden="true" className="size-2 shrink-0 animate-breathe rounded-full bg-accent" />
          </li>
        ) : null}
      </ol>
      <p className="mt-6 text-sm font-light text-muted">The answer appears only once every claim in it has been checked.</p>
    </div>
  );
}
