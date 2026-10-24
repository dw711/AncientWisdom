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
    <div className="animate-rise rounded-lg border border-rule bg-card px-6 py-5" aria-live="polite" aria-busy="true">
      <p className="font-serif text-lg text-ink">Working through the record</p>
      <ol className="mt-3 space-y-2 text-sm">
        {entries.map((e, i) => {
          const current = i === entries.length - 1;
          return (
            <li key={`${e.stage}-${i}`} className={cx("flex items-start gap-3", current ? "text-ink" : "text-muted")}>
              <span aria-hidden="true" className={cx("mt-1.5 inline-block size-2 shrink-0 rounded-full", current ? "animate-breathe bg-burgundy" : "bg-moss/70")} />
              <span>
                {e.message}
                {current ? <span className="sr-only"> (in progress)</span> : <span className="sr-only"> (done)</span>}
              </span>
            </li>
          );
        })}
        {!entries.length ? <li className="text-muted">{waitingFor ?? "Sending your description"}</li> : null}
      </ol>
      <p className="mt-4 text-xs text-muted">The answer appears only once every claim in it has been checked.</p>
    </div>
  );
}
