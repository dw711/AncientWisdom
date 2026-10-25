"use client";

import type { ProgressStage } from "@/lib/contracts/advice";
import { cx } from "./ui";

export interface ProgressEntry {
  stage: ProgressStage;
  message: string;
}

/** One placeholder block: a faint outline until its stage is reported, then set in grey with a sheen. */
function Ghost({ shown, className }: { shown: boolean; className: string }) {
  return (
    <div className={cx("relative outline outline-1 -outline-offset-1 outline-ink/10 outline-dashed", className)}>
      <div
        className={cx(
          "shimmer absolute inset-0 transition-[clip-path] duration-700 ease-[cubic-bezier(0.2,0.7,0.2,1)]",
          shown ? "[clip-path:inset(0)]" : "[clip-path:inset(0_100%_0_0)]",
        )}
      />
    </div>
  );
}

/**
 * Going to press: the stage being worked on, large, over a ghost of the front
 * page that sets one block per stage the server actually reports. It fills at
 * the pace of the real work; no invented percentages.
 */
export function ProgressPanel({ entries, waitingFor }: { entries: ProgressEntry[]; waitingFor: string | null }) {
  const current = entries.at(-1);
  const set = (block: number) => block <= entries.length;

  return (
    <div className="animate-rise py-8" aria-live="polite" aria-busy="true">
      <div className="flex items-baseline justify-between gap-4 border-b-[3px] border-ink pb-3">
        <p className="label text-burgundy">
          <span aria-hidden="true" className="animate-breathe">
            ●
          </span>{" "}
          Going to press
        </p>
        <p className="label text-muted">{entries.length ? `${entries.length} filed` : ""}</p>
      </div>
      <p key={current?.stage ?? "waiting"} className="mt-5 animate-rise font-display text-[clamp(1.6rem,3.2vw,2.6rem)] leading-tight font-black tracking-[-0.02em] text-ink">
        {current?.message ?? waitingFor ?? "Sending your letter to the desk"}
      </p>
      <ol className="sr-only">
        {entries.slice(0, -1).map((e, i) => (
          <li key={`${e.stage}-${i}`}>{e.message} (done)</li>
        ))}
      </ol>

      {/* A ghost of the page being set: lead, chart, then the edition columns. */}
      <div aria-hidden="true" className="mt-10">
        <div className="grid gap-8 border-b border-ink/20 pb-8 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-7">
            <Ghost shown={set(0)} className="h-10 w-[92%]" />
            <Ghost shown={set(0)} className="h-10 w-[78%]" />
            <Ghost shown={set(1)} className="h-10 w-[55%]" />
          </div>
          <div className="space-y-4 lg:col-span-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Ghost key={i} shown={set(2)} className="h-6 w-full" />
            ))}
          </div>
        </div>
        <div className="mt-8 grid gap-8 md:grid-cols-3">
          {[3, 4, 5].map((b) => (
            <div key={b} className="space-y-3">
              <Ghost shown={set(b)} className="h-8 w-full" />
              <Ghost shown={set(b)} className="h-20 w-20" />
              <Ghost shown={set(b)} className="h-7 w-[85%]" />
              <Ghost shown={set(b)} className="h-3 w-full" />
              <Ghost shown={set(b)} className="h-3 w-[94%]" />
              <Ghost shown={set(b)} className="h-3 w-[70%]" />
            </div>
          ))}
        </div>
      </div>
      <p className="label mt-8 text-muted">Nothing is printed until every claim in it has been checked.</p>
    </div>
  );
}
