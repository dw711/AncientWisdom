"use client";

import type { ProgressStage } from "@/lib/contracts/advice";
import { cx } from "./ui";

export interface ProgressEntry {
  stage: ProgressStage;
  message: string;
}

/** The stages the server actually reports, set as a wire-service ticker. No invented percentages. */
export function ProgressPanel({ entries, waitingFor }: { entries: ProgressEntry[]; waitingFor: string | null }) {
  return (
    <div className="animate-rise border-y-[3px] border-ink py-6" aria-live="polite" aria-busy="true">
      <p className="label text-burgundy">Stop press</p>
      <p className="mt-1 font-display text-[2.2rem] leading-tight font-black tracking-[-0.02em] text-ink">Going to press…</p>
      <ol className="mt-5 divide-y divide-ink/20 border-t border-ink">
        {entries.map((e, i) => {
          const current = i === entries.length - 1;
          return (
            <li key={`${e.stage}-${i}`} className={cx("flex animate-rise items-baseline gap-4 py-2.5", current ? "text-ink" : "text-muted")}>
              <span className="label w-14 shrink-0">{current ? <span className="animate-breathe text-burgundy">● Live</span> : "Filed"}</span>
              <span>
                {e.message}
                {current ? <span className="sr-only"> (in progress)</span> : <span className="sr-only"> (done)</span>}
              </span>
            </li>
          );
        })}
        {!entries.length ? <li className="py-2.5 text-muted">{waitingFor ?? "Sending your letter to the desk"}</li> : null}
      </ol>
      <p className="label mt-5 text-muted">Nothing is printed until every claim in it has been checked.</p>
    </div>
  );
}
