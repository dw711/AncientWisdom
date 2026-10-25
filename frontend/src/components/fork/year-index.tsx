"use client";

import { formatYear } from "@/lib/case-refs";
import { brief } from "@/lib/case-refs";
import type { ForkPath, Focus } from "./model";

interface Props {
  paths: ForkPath[];
  revealed: number[];
  focus: Focus | null;
  onHover: (f: Focus | null) => void;
  onJump: (pathId: string) => void;
  onToday: () => void;
}

/**
 * Compact year strip pinned under the top bar; hover or focus expands a panel
 * with each case's decision. Years darken as the fork reaches them.
 */
export function YearIndex({ paths, revealed, focus, onHover, onJump, onToday }: Props) {
  const hover = (p: ForkPath) => ({
    onMouseEnter: () => onHover({ source: p.id, t: focus?.t ?? 0 }),
    onMouseLeave: () => onHover(null),
    onFocus: () => onHover({ source: p.id, t: focus?.t ?? 0 }),
    onBlur: () => onHover(null),
  });

  return (
    <nav aria-label="Year index" className="group sticky top-[52px] z-40 h-9 border-b border-ink/20 bg-paper/95 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-[1440px] items-center gap-6 overflow-x-auto px-4 md:px-12">
        <span className="label shrink-0 text-muted">Index</span>
        <ol className="flex shrink-0 items-center gap-5">
          {paths.map((p, k) => {
            const reached = (revealed[k] ?? 0) > 0;
            const on = focus?.source === p.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  {...hover(p)}
                  onClick={() => onJump(p.id)}
                  className="label flex items-center gap-1.5 transition-colors duration-300"
                  style={{ color: on ? p.color : reached ? "#14120F" : "rgba(20,18,15,.35)" }}
                >
                  <span aria-hidden="true" className="size-2 rounded-full" style={{ background: p.color }} />
                  <span className="tabular-nums">{formatYear(p.card.year_start)}</span>
                  <span className="hidden normal-case tracking-normal sm:inline">{p.short}</span>
                </button>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={onToday} className="label flex items-center gap-1.5 text-burgundy">
              <span aria-hidden="true" className="size-2 rotate-45 bg-burgundy" />
              Today
            </button>
          </li>
        </ol>
        <span className="label ml-auto hidden shrink-0 text-muted/70 lg:inline">Hover to expand</span>
      </div>

      {/* Overlays the page, so nothing below shifts while it is open. */}
      <div className="invisible absolute inset-x-0 top-full grid grid-rows-[0fr] border-b border-ink bg-paper opacity-0 transition-all duration-300 group-focus-within:visible group-focus-within:grid-rows-[1fr] group-focus-within:opacity-100 group-hover:visible group-hover:grid-rows-[1fr] group-hover:opacity-100">
        <div className="overflow-hidden">
          <ol className="mx-auto grid max-w-[1440px] gap-4 px-4 py-4 sm:grid-cols-2 md:px-12 lg:grid-cols-4">
            {paths.map((p) => (
              <li key={p.id}>
                <button type="button" tabIndex={-1} {...hover(p)} onClick={() => onJump(p.id)} className="block w-full border-t-2 pt-2 text-left" style={{ borderColor: p.color }}>
                  <span className="label block text-muted">
                    {p.card.date_detail} · {p.roleLabel}
                    {p.rating ? ` · fit ${p.rating.analogy_fit}` : ""}
                  </span>
                  <span className="mt-0.5 block font-serif text-[17px] leading-tight text-ink">{p.card.title}</span>
                  <span className="mt-1 block text-[13px] leading-snug text-ink-soft">{brief(p.card.decision_question, 120)}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </nav>
  );
}
