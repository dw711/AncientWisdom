"use client";

import { useRef } from "react";
import type { PartialResponse, ReadyResponse } from "@/lib/contracts/advice";
import { formatYear } from "@/lib/case-refs";
import { Tag } from "../ui";
import { ComparePlot } from "./compare-plot";
import { gsap, MOTION_OK, useGSAP } from "../precedent/gsap";
import type { Edition } from "../precedent/model";

/** "First sentence. The rest." → ["First sentence.", "The rest."] */
function splitLead(text: string): [string, string] {
  const m = text.match(/^([^]+?[.!?])\s+([^]+)$/);
  return m ? [m[1]!, m[2]!] : [text, ""];
}

/**
 * Above the fold: the paper's view as the headline, a chart of how closely
 * each edition matches (its legend is the index), and a wire ticker of their
 * lessons. The advice leads; the history that supports it follows below.
 */
export function LeadStory({ response: r, editions }: { response: ReadyResponse | PartialResponse; editions: Edition[] }) {
  const root = useRef<HTMLElement>(null);
  const partial = r.status === "partial" ? r : null;
  const [headline, standfirst] = r.recommendation
    ? splitLead(r.recommendation.text)
    : [partial?.preview ? "Related cases, not yet assessed for fit" : "Today’s cases, printed without a verdict", partial?.message ?? ""];
  const words = headline.split(/\s+/);
  const ticker = editions.filter((e) => e.lesson);

  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        gsap
          .timeline({ scrollTrigger: { trigger: root.current, start: "top 85%" } })
          .from("[data-word]", { yPercent: 115, duration: 0.9, ease: "power4.out", stagger: 0.035 })
          .from("[data-stand]", { opacity: 0, y: 10, duration: 0.6 }, "-=0.5")
          .from("[data-index-row]", { opacity: 0, x: -16, duration: 0.5, stagger: 0.08 }, "<")
          .from("[data-dot]", { scale: 0, duration: 0.5, ease: "back.out(2)", stagger: 0.03 }, "<0.1");
      });
    },
    { scope: root, dependencies: [r.request_id], revertOnUpdate: true },
  );

  return (
    <section ref={root} id="front" aria-labelledby="front-h" className="scroll-mt-20 border-b border-ink">
      <div className="grid gap-10 py-10 lg:grid-cols-12 lg:gap-0">
        <div className="lg:col-span-7 lg:border-r lg:border-ink lg:pr-10">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <p className="label text-burgundy">Front page · {r.recommendation ? "Our view" : "No editorial"}</p>
            {r.recommendation ? <Tag tone="bronze">◇ Modern inference, not historical fact</Tag> : null}
          </div>
          <h2 id="front-h" className="font-display text-[clamp(2.1rem,4.6vw,4.2rem)] leading-[1.02] font-black tracking-[-0.03em] text-ink">
            {words.map((w, i) => (
              // Each word rises out of its own mask; the padding keeps descenders inside it.
              <span key={i} className="-mb-[0.12em] inline-block overflow-hidden pb-[0.12em] align-top">
                <span data-word className="inline-block">
                  {w}
                  {i < words.length - 1 ? " " : ""}
                </span>
              </span>
            ))}
          </h2>
          {standfirst ? (
            <p data-stand className="mt-5 max-w-[60ch] text-[1.15rem] leading-relaxed text-ink-soft italic">
              {standfirst}
            </p>
          ) : null}
          <a href="#editorial" className="label mt-6 inline-flex items-center gap-2 text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
            What to do next <span aria-hidden="true">↓</span>
          </a>
        </div>

        {editions.length ? (
          <div className="space-y-8 lg:col-span-5 lg:pl-10">
            <ComparePlot editions={editions} />
            <nav aria-label="Editions in this issue">
            <ol className="border-t border-ink">
              {editions.map((e) => (
                <li key={e.id} data-index-row className="border-b border-ink">
                  <a
                    href={`#edition-${e.letter.toLowerCase()}`}
                    style={{ ["--ed" as string]: e.color }}
                    className="group relative flex items-baseline gap-4 overflow-hidden px-2 py-2.5 transition-colors duration-300 hover:text-paper focus-visible:text-paper"
                  >
                    {/* The edition's ink wipes in from the left on hover. */}
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 origin-left scale-x-0 bg-[var(--ed)] transition-transform duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] group-hover:scale-x-100 group-focus-visible:scale-x-100"
                    />
                    {/* Same lettered dot as the chart: this list is its legend. */}
                    <span className="relative grid size-[22px] shrink-0 place-items-center self-center rounded-full bg-[var(--ed)] font-mono text-[11px] text-paper ring-paper transition-shadow group-hover:ring-2 group-focus-visible:ring-2">
                      {e.letter}
                    </span>
                    <span className="relative min-w-0 flex-1 font-display text-[20px] leading-tight">{e.short}</span>
                    <span className="label relative shrink-0 opacity-70">{formatYear(e.card.year_start)}</span>
                    <span aria-hidden="true" className="relative -translate-x-2 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
                      →
                    </span>
                  </a>
                </li>
              ))}
            </ol>
            </nav>
          </div>
        ) : null}
      </div>

      {ticker.length ? (
        // Decorative: every lesson is printed in its edition below.
        <div aria-hidden="true" className="group -mx-4 overflow-hidden bg-ink py-2.5 text-paper md:mx-0">
          <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused] motion-reduce:animate-none">
            {[0, 1].map((copy) => (
              <p key={copy} className="label flex shrink-0 items-center">
                {ticker.map((e) => (
                  <span key={e.id} className="flex items-center whitespace-nowrap">
                    <span className="px-6 text-burgundy">✦</span>
                    <span className="mr-3 text-paper/60">
                      Edition {e.letter} · {e.short}
                    </span>
                    {e.lesson}
                  </span>
                ))}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
