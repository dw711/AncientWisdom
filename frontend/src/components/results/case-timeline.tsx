"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { CaseCard } from "@/lib/contracts/advice";
import { brief, formatYear } from "@/lib/case-refs";
import { cx } from "../ui";

export interface TimelineItem {
  card: CaseCard;
  role: "supporting" | "challenging" | "unrated";
  /** Lesson for the person's decision, when the analysis produced one. */
  lesson: string | null;
}

function gapLabel(from: number | null, to: number | null): string | null {
  if (from === null || to === null) return null;
  const years = to - from;
  if (years <= 0) return "same year";
  if (years === 1) return "1 year";
  const rounded = years >= 1000 ? Math.round(years / 50) * 50 : years >= 100 ? Math.round(years / 10) * 10 : years;
  return `${years >= 100 ? "≈" : ""}${rounded.toLocaleString("en-GB")} years`;
}

const ROLE: Record<TimelineItem["role"], { label: string; dot: string }> = {
  supporting: { label: "Supports the advice", dot: "bg-bronze ring-bronze/25" },
  challenging: { label: "Challenges the advice", dot: "bg-burgundy ring-burgundy/25" },
  unrated: { label: "Related case", dot: "bg-muted ring-muted/25" },
};

/**
 * Horizontal timeline of the cases in an answer. Points are evenly spaced in
 * date order, with the gap between them labelled, so that close modern dates
 * stay readable next to ancient ones. Hover or focus shows a summary; the point
 * itself links to the full story.
 */
export function CaseTimeline({ items }: { items: TimelineItem[] }) {
  const sorted = [...items].sort((a, b) => (a.card.year_start ?? Infinity) - (b.card.year_start ?? Infinity));
  const wrapper = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<{ index: number; left: number; top: number; arrow: number } | null>(null);
  const tipId = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const [moreRight, setMoreRight] = useState(false);
  const POPOVER_WIDTH = 336;

  // Show a fade on the right edge while more of the timeline is off-screen (narrow screens).
  const measure = useCallback(() => {
    const el = scroller.current;
    if (el) setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  const show = useCallback((index: number, el: HTMLElement) => {
    const box = wrapper.current?.getBoundingClientRect();
    if (!box) return;
    const r = el.getBoundingClientRect();
    const centre = r.left + r.width / 2 - box.left;
    const width = Math.min(POPOVER_WIDTH, box.width);
    const left = Math.max(0, Math.min(centre - width / 2, box.width - width));
    setActive({ index, left, top: r.bottom - box.top + 10, arrow: centre - left });
  }, []);
  const hide = useCallback(() => setActive(null), []);

  if (!sorted.length) return null;
  const current = active ? sorted[active.index] : null;

  return (
    <div ref={wrapper} className="relative" onKeyDown={(e) => e.key === "Escape" && hide()}>
      <div
        ref={scroller}
        className="overflow-x-auto pb-1"
        onScroll={() => {
          hide();
          measure();
        }}
      >
        <ol className="relative flex min-w-full" aria-label="Timeline of the historical cases">
          {/* The axis runs through the centre of the points. */}
          <span aria-hidden="true" className="absolute top-[2.65rem] right-[calc(50%/var(--n))] left-[calc(50%/var(--n))] h-px bg-rule" style={{ ["--n" as string]: sorted.length }} />
          {sorted.map((item, i) => {
            const next = sorted[i + 1];
            const gap = next ? gapLabel(item.card.year_start, next.card.year_start) : null;
            const isActive = active?.index === i;
            return (
              <li key={item.card.case_id} className="relative flex min-w-[9.5rem] flex-1 flex-col items-center px-2 text-center">
                <span className="h-6 font-serif text-[0.95rem] text-ink-soft">{formatYear(item.card.year_start)}</span>
                <Link
                  href={`/cases/${encodeURIComponent(item.card.case_id)}`}
                  aria-describedby={isActive ? tipId : undefined}
                  aria-label={`${item.card.title}, ${item.card.display_date}. Open the full story.`}
                  onMouseEnter={(e) => show(i, e.currentTarget)}
                  onMouseLeave={hide}
                  onFocus={(e) => show(i, e.currentTarget)}
                  onBlur={hide}
                  className="group relative mt-2 flex flex-col items-center rounded-md px-1 pb-1 outline-offset-4"
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      "relative z-10 mt-[0.15rem] block size-3.5 rounded-full ring-4 transition-transform group-hover:scale-125 group-focus-visible:scale-125",
                      ROLE[item.role].dot,
                      isActive && "scale-125",
                    )}
                  />
                  <span className={cx("mt-3 line-clamp-2 text-[0.86rem] leading-snug text-ink group-hover:text-burgundy", isActive && "text-burgundy")}>{item.card.title}</span>
                  <span className="mt-1 text-[0.66rem] font-semibold tracking-[0.12em] text-muted uppercase">{item.role === "challenging" ? "Challenge" : item.role === "supporting" ? "Comparison" : "Related"}</span>
                </Link>
                {gap ? (
                  <span aria-hidden="true" className="absolute top-[2.15rem] right-0 z-10 translate-x-1/2 bg-paper px-1.5 text-[0.66rem] whitespace-nowrap text-muted italic">
                    {gap}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
      {moreRight ? <span aria-hidden="true" className="pointer-events-none absolute top-0 right-0 h-[7.5rem] w-12 bg-gradient-to-l from-paper to-transparent" /> : null}
      <p className="mt-2 text-xs text-muted">
        {moreRight ? "Scroll sideways for more. " : ""}Hover or focus a point for a summary; select it to read the full story.
      </p>

      {current && active ? (
        <div
          id={tipId}
          role="tooltip"
          className="pointer-events-none absolute z-30 animate-rise rounded-lg border border-rule bg-card p-4 text-left shadow-[0_12px_32px_-12px_rgb(29_26_22/0.35)]"
          style={{ left: active.left, top: active.top, width: `min(${POPOVER_WIDTH}px, 100%)` }}
        >
          <span aria-hidden="true" className="absolute -top-1.5 size-3 rotate-45 border-t border-l border-rule bg-card" style={{ left: active.arrow - 6 }} />
          <p className="text-[0.68rem] font-semibold tracking-[0.12em] text-bronze uppercase">
            {current.card.display_date} · {ROLE[current.role].label}
          </p>
          <p className="mt-1 font-serif text-lg leading-snug text-ink">{current.card.title}</p>
          <dl className="mt-3 space-y-2.5 text-[0.86rem] leading-relaxed">
            <div>
              <dt className="text-[0.66rem] font-semibold tracking-[0.12em] text-muted uppercase">What they did</dt>
              <dd className="text-ink-soft">{brief(current.card.chosen_action.text, 200)}</dd>
            </div>
            <div>
              <dt className="text-[0.66rem] font-semibold tracking-[0.12em] text-muted uppercase">What happened</dt>
              <dd className="text-ink-soft">{brief(current.card.outcome.text, 220)}</dd>
            </div>
            {current.lesson || current.card.lesson.text || current.card.pattern ? (
              <div>
                <dt className="text-[0.66rem] font-semibold tracking-[0.12em] text-muted uppercase">{current.lesson ? "The lesson for you" : "The lesson"}</dt>
                <dd className="text-ink">{brief(current.lesson || current.card.lesson.text || current.card.pattern || "", 200)}</dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-3 text-xs font-medium text-burgundy">Select to read the full story →</p>
        </div>
      ) : null}
    </div>
  );
}
