"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { CaseCard } from "@/lib/contracts/advice";
import { brief, formatYear } from "@/lib/case-refs";
import { ArrowRight, cx } from "../ui";

export type TimelineNode =
  | { kind: "case"; key: string; card: CaseCard; role: "supporting" | "challenging" | "unrated"; lesson: string | null; fit: number | null }
  | { kind: "today"; key: "today"; hint: string };

const ROLE = {
  supporting: { label: "Comparison", dot: "size-3.5 rounded-full bg-ink" },
  challenging: { label: "Challenge", dot: "size-3.5 rounded-full border-[2.5px] border-ink bg-paper" },
  unrated: { label: "Related case", dot: "size-3 rounded-full bg-ink/35" },
} as const;

function gapLabel(from: number | null, to: number | null): string | null {
  if (from === null || to === null) return null;
  const years = to - from;
  if (years <= 0) return "same year";
  if (years === 1) return "1 year";
  const rounded = years >= 1000 ? Math.round(years / 50) * 50 : years >= 100 ? Math.round(years / 10) * 10 : years;
  return `${years >= 100 ? "≈" : ""}${rounded.toLocaleString("en-GB")} years`;
}

/** Distance from the top of a column to the centre of its point; the axis is drawn there. */
const AXIS = "7.25rem";

/**
 * The results' main view: one large left-to-right timeline of the historical
 * moments, ending with the person's own decision. Hover previews a moment;
 * selecting one opens its details underneath (passed in as `children`).
 */
export function DecisionTimeline({
  nodes,
  selected,
  onSelect,
  panelTone = "light",
  children,
}: {
  nodes: TimelineNode[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  /** Colour of the details panel's top edge, so its pointer matches. */
  panelTone?: "light" | "dark";
  children?: ReactNode;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [hover, setHover] = useState<{ key: string; left: number; top: number; arrow: number } | null>(null);
  const [arrow, setArrow] = useState<number | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const tipId = useId();
  const panelId = useId();
  const TIP_WIDTH = 360;

  const measureEdges = useCallback(() => {
    const el = scroller.current;
    if (el) setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  const centreOf = useCallback((key: string) => {
    const box = wrapper.current?.getBoundingClientRect();
    const r = buttons.current.get(key)?.querySelector("[data-dot]")?.getBoundingClientRect();
    if (!box || !r) return null;
    return { centre: r.left + r.width / 2 - box.left, bottom: r.bottom - box.top, width: box.width };
  }, []);

  // Keep the details panel's pointer under the selected point, and hide it while that point is scrolled out of view.
  useLayoutEffect(() => {
    const update = () => {
      const m = selected ? centreOf(selected) : null;
      setArrow(m && m.centre >= 12 && m.centre <= m.width - 12 ? m.centre : null);
    };
    update();
    const el = scroller.current;
    // Bring the selected point into the middle of the timeline (it can be off-screen when chosen from the toolbar).
    const item = selected ? buttons.current.get(selected)?.closest("li") : null;
    if (el && item) el.scrollTo({ left: item.offsetLeft - (el.clientWidth - item.offsetWidth) / 2, behavior: "smooth" });
    el?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [selected, centreOf]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(measureEdges);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measureEdges]);

  const showTip = (key: string) => {
    const m = centreOf(key);
    if (!m) return;
    const width = Math.min(TIP_WIDTH, m.width);
    const left = Math.max(0, Math.min(m.centre - width / 2, m.width - width));
    setHover({ key, left, top: m.bottom + 18, arrow: m.centre - left });
  };

  // Arrow keys move between points; Escape closes the details.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setHover(null);
      onSelect(null);
      return;
    }
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const keys = nodes.map((n) => n.key);
    const current = keys.findIndex((k) => buttons.current.get(k) === document.activeElement);
    if (current < 0) return;
    e.preventDefault();
    const next = keys[Math.max(0, Math.min(keys.length - 1, current + (e.key === "ArrowRight" ? 1 : -1)))];
    buttons.current.get(next)?.focus();
  };

  const hovered = hover ? nodes.find((n) => n.key === hover.key) : null;

  return (
    <div ref={wrapper} className="relative" onKeyDown={onKeyDown}>
      <div
        ref={scroller}
        className="snap-x snap-mandatory overflow-x-auto pb-3 [scrollbar-width:thin]"
        onScroll={() => {
          setHover(null);
          measureEdges();
        }}
      >
        <ol className="relative flex min-w-full" aria-label="Timeline of historical moments, ending with your decision">
          {nodes.map((node, i) => {
            const next = nodes[i + 1];
            const isToday = node.kind === "today";
            const year = node.kind === "case" ? node.card.year_start : null;
            const gap = node.kind === "case" && next ? gapLabel(year, next.kind === "case" ? next.card.year_start : new Date().getFullYear()) : null;
            const intoToday = next?.kind === "today";
            const active = selected === node.key;
            return (
              <li key={node.key} className="relative flex min-w-[min(72vw,15rem)] flex-1 shrink-0 snap-center flex-col items-center px-3 text-center sm:min-w-[11rem]">
                {/* The axis is drawn in halves inside each point, so it joins neighbours at any width. */}
                {i > 0 ? (
                  <span aria-hidden="true" className={cx("absolute right-1/2 left-0 h-px", isToday ? "bg-accent/70" : "bg-ink/20")} style={{ top: `calc(${AXIS} - 0.5px)` }} />
                ) : null}
                {next ? (
                  <span aria-hidden="true" className={cx("absolute right-0 left-1/2 h-px", intoToday ? "bg-accent/70" : "bg-ink/20")} style={{ top: `calc(${AXIS} - 0.5px)` }} />
                ) : null}
                <span className="flex h-[5rem] items-end text-[clamp(2.1rem,3.7vw,3.6rem)] leading-[0.85] font-semibold tracking-[-0.055em] whitespace-nowrap text-ink">
                  {isToday ? "Today" : formatYear(year)}
                </span>
                <button
                  type="button"
                  ref={(el) => {
                    if (el) buttons.current.set(node.key, el);
                    else buttons.current.delete(node.key);
                  }}
                  aria-expanded={active}
                  aria-controls={active ? panelId : undefined}
                  aria-describedby={hover?.key === node.key ? tipId : undefined}
                  onClick={() => {
                    setHover(null);
                    onSelect(active ? null : node.key);
                  }}
                  onMouseEnter={() => node.kind === "case" && showTip(node.key)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => node.kind === "case" && showTip(node.key)}
                  onBlur={() => setHover(null)}
                  className="group mt-6 flex flex-col items-center rounded-lg px-2 pb-2 outline-offset-4"
                >
                  <span className="flex size-6 items-center justify-center">
                    <span
                      data-dot
                      aria-hidden="true"
                      className={cx(
                        "relative z-10 block ring-[6px] ring-paper transition-transform duration-300 group-hover:scale-[1.35] group-focus-visible:scale-[1.35]",
                        isToday ? "size-3.5 rotate-45 rounded-[2px] bg-accent" : ROLE[node.role].dot,
                        active && "scale-[1.35] outline outline-[1.5px] outline-offset-[5px] outline-ink",
                      )}
                    />
                  </span>
                  <span
                    className={cx(
                      "mt-5 line-clamp-3 max-w-[15rem] text-[clamp(1rem,1.35vw,1.15rem)] leading-snug font-medium tracking-[-0.015em] text-ink underline decoration-[1.5px] underline-offset-[5px] transition-colors",
                      active ? "decoration-ink" : "decoration-transparent group-hover:decoration-ink/30",
                    )}
                  >
                    {isToday ? "Your decision" : node.card.title}
                  </span>
                  <span className="mt-2 text-[0.8125rem] font-light text-ink-soft">
                    {isToday ? (
                      node.hint
                    ) : node.fit !== null ? (
                      <>
                        {ROLE[node.role].label} · Fit <span className="font-medium text-ink">{node.fit}</span>/100
                      </>
                    ) : (
                      ROLE[node.role].label
                    )}
                  </span>
                </button>
                {gap ? (
                  <span
                    aria-hidden="true"
                    className="absolute right-0 z-10 translate-x-1/2 -translate-y-1/2 bg-paper px-2 text-xs font-light whitespace-nowrap text-muted"
                    style={{ top: AXIS }}
                  >
                    {gap}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
      {edges.left ? <span aria-hidden="true" className="pointer-events-none absolute top-0 left-0 h-[14rem] w-12 bg-gradient-to-r from-paper to-transparent" /> : null}
      {edges.right ? <span aria-hidden="true" className="pointer-events-none absolute top-0 right-0 h-[14rem] w-12 bg-gradient-to-l from-paper to-transparent" /> : null}

      {!selected ? (
        <p className="mt-8 text-center text-sm font-light text-ink-soft">
          {edges.right ? "Scroll sideways for more. " : ""}Select a moment to see what it teaches, or select <span className="font-medium text-ink">Your decision</span> for the advice.
        </p>
      ) : null}

      {hovered && hovered.kind === "case" && hover && !selected ? (
        <div
          id={tipId}
          role="tooltip"
          className="pointer-events-none absolute z-30 animate-rise rounded-xl border border-rule-soft bg-card text-left shadow-[0_28px_60px_-28px_rgb(0_0_0/0.4)]"
          style={{ left: hover.left, top: hover.top, width: `min(${TIP_WIDTH}px, 100%)` }}
        >
          <span aria-hidden="true" className="absolute -top-1.5 size-3 rotate-45 border-t border-l border-rule-soft bg-card" style={{ left: hover.arrow - 6 }} />
          <div className="px-5 pt-4 pb-3">
            <p className="text-xs font-light text-muted">{hovered.card.display_date}</p>
            <p className="mt-1 text-[1.05rem] leading-snug font-semibold tracking-[-0.02em] text-ink">{hovered.card.title}</p>
          </div>
          <dl className="text-[0.8125rem]">
            <TipRow label="What they did">{brief(hovered.card.chosen_action.text, 150)}</TipRow>
            <TipRow label="What happened">{brief(hovered.card.outcome.text, 150)}</TipRow>
            {hovered.lesson || hovered.card.lesson.text || hovered.card.pattern ? (
              <TipRow label="The lesson" lesson>
                {brief(hovered.lesson || hovered.card.lesson.text || hovered.card.pattern || "", 150)}
              </TipRow>
            ) : null}
          </dl>
          <p className="flex items-center justify-between rounded-b-xl border-t border-rule-soft px-5 py-3 text-[0.8125rem] font-medium text-ink">
            Select for details <ArrowRight />
          </p>
        </div>
      ) : null}

      {selected && children ? (
        <div id={panelId} data-detail className="relative mt-10 scroll-mt-4">
          {arrow !== null ? (
            <span
              aria-hidden="true"
              className={cx("absolute -top-[7px] z-10 size-3.5 rotate-45 border-t border-l", panelTone === "dark" ? "border-night bg-night" : "border-rule-soft bg-card")}
              style={{ left: arrow - 7 }}
            />
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}

function TipRow({ label, lesson, children }: { label: string; lesson?: boolean; children: ReactNode }) {
  return (
    <div className={cx("grid grid-cols-[5.75rem_1fr] gap-3 border-t border-rule-soft px-5 py-3", lesson && "bg-highlight-wash")}>
      <dt className="font-semibold text-ink">{label}</dt>
      <dd className={cx("leading-relaxed", lesson ? "text-ink" : "font-light text-ink-soft")}>{children}</dd>
    </div>
  );
}
