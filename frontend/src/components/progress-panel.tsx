"use client";

import type { ProgressStage } from "@/lib/contracts/advice";
import { cx } from "./ui";

export interface ProgressEntry {
  stage: ProgressStage;
  message: string;
}

/**
 * The stages the server actually reports, drawn as stops on a line that
 * grows toward the fork. No invented percentages.
 */
export function ProgressPanel({ entries, waitingFor }: { entries: ProgressEntry[]; waitingFor: string | null }) {
  return (
    <div className="animate-rise py-6" aria-live="polite" aria-busy="true">
      <p className="label text-muted">Walking the record</p>
      <p className="mt-2 font-serif text-[2rem] leading-tight text-ink italic">Finding the paths others took…</p>
      <ol className="relative mt-8 space-y-4 border-l border-ink pl-6">
        {entries.map((e, i) => {
          const current = i === entries.length - 1;
          return (
            <li key={`${e.stage}-${i}`} className={cx("relative animate-rise text-[15px]", current ? "text-ink" : "text-muted")}>
              <span
                aria-hidden="true"
                className={cx("absolute top-[0.4em] -left-[31px] size-[11px] rounded-full border-2 border-ink", current ? "animate-breathe bg-burgundy" : "bg-paper")}
              />
              <span className="label mr-3 text-muted">{String(i + 1).padStart(2, "0")}</span>
              {e.message}
              {current ? <span className="sr-only"> (in progress)</span> : <span className="sr-only"> (done)</span>}
            </li>
          );
        })}
        {!entries.length ? <li className="text-muted">{waitingFor ?? "Sending your description"}</li> : null}
      </ol>
      <p className="label mt-8 text-muted">The answer appears only once every claim in it has been checked.</p>
    </div>
  );
}
