"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { CaseCard } from "@/lib/contracts/advice";
import { brief, formatYear } from "@/lib/case-refs";
import { cx } from "../ui";

export type TimelineNode =
  | { kind: "case"; key: string; card: CaseCard; role: "supporting" | "challenging" | "unrated"; lesson: string | null; fit: number | null }
  | { kind: "today"; key: "today"; hint: string };

const ROLE = {
  supporting: { label: "Comparison", dot: "bg-bronze ring-bronze/20" },
  challenging: { label: "Challenge", dot: "bg-burgundy ring-burgundy/20" },
  unrated: { label: "Related case", dot: "bg-muted ring-muted/20" },
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
const AXIS = "7.1rem";

/**
 * The results' main view: one large left-to-right timeline of the historical
 * moments, ending with the person's own decision. Hover previews a moment;
 * selecting one opens its details underneath (passed in as `children`).
 */
export function DecisionTimeline({
  nodes,
  selected,
  onSelect,
  children,
}: {
  nodes: TimelineNode[];
  selected: string | null;
  onSelect: (key: string | null) => void;
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
  const TIP_WIDTH = 340;

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

  // Keep the details panel's pointer under the selected point.
  useLayoutEffect(() => {
    const update = () => setArrow(selected ? (centreOf(selected)?.centre ?? null) : null);
    update();
    const el = scroller.current;
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
    setHover({ key, left, top: m.bottom + 14, arrow: m.centre - left });
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
        className="snap-x snap-mandatory overflow-x-auto pb-2"
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
              <li key={node.key} className="relative flex min-w-[min(72vw,15rem)] flex-1 shrink-0 snap-center sm:min-w-[11rem] flex-col items-center px-3 text-center">
                {/* The axis is drawn in halves inside each point, so it joins neighbours at any width. */}
                {i > 0 ? (
                  <span aria-hidden="true" className={cx("absolute right-1/2 left-0 h-[2px]", isToday ? "bg-burgundy/45" : "bg-rule")} style={{ top: `calc(${AXIS} - 1px)` }} />
                ) : null}
                {next ? (
                  <span aria-hidden="true" className={cx("absolute right-0 left-1/2 h-[2px]", intoToday ? "bg-burgundy/45" : "bg-rule")} style={{ top: `calc(${AXIS} - 1px)` }} />
                ) : null}
                <span className={cx("flex h-[4.6rem] items-end font-serif leading-none tracking-tight", isToday ? "text-burgundy" : "text-ink", "text-[clamp(1.7rem,3.1vw,2.6rem)]")}>
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
                  className="group mt-[1.85rem] flex flex-col items-center rounded-lg px-2 pb-2 outline-offset-4"
                >
                  <span
                    data-dot
                    aria-hidden="true"
                    className={cx(
                      "relative z-10 block ring-[7px] transition-transform duration-200 group-hover:scale-125 group-focus-visible:scale-125",
                      isToday ? "size-[1.15rem] rotate-45 rounded-[3px] bg-burgundy ring-burgundy/15" : cx("size-[1.3rem] rounded-full", ROLE[node.role].dot),
                      active && "scale-125 ring-[10px]",
                    )}
                  />
                  <span
                    className={cx(
                      "mt-6 line-clamp-3 max-w-[15rem] font-serif text-[clamp(1.02rem,1.5vw,1.22rem)] leading-snug transition-colors",
                      active ? "text-burgundy" : "text-ink group-hover:text-burgundy",
                    )}
                  >
                    {isToday ? "Your decision" : node.card.title}
                  </span>
                  <span className="mt-2 text-[0.68rem] font-semibold tracking-[0.14em] text-muted uppercase">
                    {isToday ? node.hint : node.fit !== null ? `${ROLE[node.role].label} · fit ${node.fit}` : ROLE[node.role].label}
                  </span>
                </button>
                {gap ? (
                  <span
                    aria-hidden="true"
                    className="absolute right-0 z-10 translate-x-1/2 -translate-y-1/2 bg-paper px-2 text-[0.72rem] whitespace-nowrap text-muted italic"
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
      {edges.left ? <span aria-hidden="true" className="pointer-events-none absolute top-0 left-0 h-[13rem] w-10 bg-gradient-to-r from-paper to-transparent" /> : null}
      {edges.right ? <span aria-hidden="true" className="pointer-events-none absolute top-0 right-0 h-[13rem] w-10 bg-gradient-to-l from-paper to-transparent" /> : null}

      {!selected ? (
        <p className="mt-6 text-center text-sm text-muted">
          {edges.right ? "Scroll sideways for more. " : ""}Select a moment to see what it teaches, or select <span className="text-burgundy">Your decision</span> for the advice.
        </p>
      ) : null}

      {hovered && hovered.kind === "case" && hover && !selected ? (
        <div
          id={tipId}
          role="tooltip"
          className="pointer-events-none absolute z-30 animate-rise rounded-lg border border-rule bg-card p-4 text-left shadow-[0_14px_36px_-14px_rgb(29_26_22/0.4)]"
          style={{ left: hover.left, top: hover.top, width: `min(${TIP_WIDTH}px, 100%)` }}
        >
          <span aria-hidden="true" className="absolute -top-1.5 size-3 rotate-45 border-t border-l border-rule bg-card" style={{ left: hover.arrow - 6 }} />
          <p className="text-[0.66rem] font-semibold tracking-[0.12em] text-bronze uppercase">{hovered.card.display_date}</p>
          <dl className="mt-2 space-y-2 text-[0.85rem] leading-relaxed">
            <div>
              <dt className="text-[0.64rem] font-semibold tracking-[0.12em] text-muted uppercase">What they did</dt>
              <dd className="text-ink-soft">{brief(hovered.card.chosen_action.text, 170)}</dd>
            </div>
            <div>
              <dt className="text-[0.64rem] font-semibold tracking-[0.12em] text-muted uppercase">What happened</dt>
              <dd className="text-ink-soft">{brief(hovered.card.outcome.text, 170)}</dd>
            </div>
            {hovered.lesson || hovered.card.lesson.text || hovered.card.pattern ? (
              <div>
                <dt className="text-[0.64rem] font-semibold tracking-[0.12em] text-muted uppercase">The lesson</dt>
                <dd className="text-ink">{brief(hovered.lesson || hovered.card.lesson.text || hovered.card.pattern || "", 170)}</dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-2 text-xs font-medium text-burgundy">Select for details</p>
        </div>
      ) : null}

      {selected && children ? (
        <div id={panelId} className="relative mt-8">
          {arrow !== null ? (
            <span aria-hidden="true" className="absolute -top-[7px] z-10 size-3.5 rotate-45 border-t border-l border-rule bg-card" style={{ left: arrow - 7 }} />
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
