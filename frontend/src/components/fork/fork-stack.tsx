"use client";

import { useRef } from "react";
import type { OpenSources } from "../results/case-detail";
import { gsap, MOTION_OK, useGSAP } from "./gsap";
import { Odometer } from "./odometer";
import { Avatar } from "./fork-stage";
import { fractionOf, isHighlighted, opacityFor, stageNameAt, type Focus, type ForkPath } from "./model";

interface Props {
  paths: ForkPath[];
  focus: Focus | null;
  handleT: number;
  onHover: (f: Focus | null) => void;
  onHandle: (t: number) => void;
  onOpenSources: OpenSources;
  onShowDetails: (pathId: string) => void;
}

/** Small-screen fork: the trunk splits into stacked vertical paths, with a stage slider. */
export function ForkStack({ paths, focus, handleT, onHover, onHandle, onOpenSources, onShowDetails }: Props) {
  const root = useRef<HTMLElement>(null);
  const steps = Math.max(...paths.map((p) => p.stops.length)) - 1;

  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        gsap.utils.toArray<HTMLElement>("[data-stack-line]").forEach((el) => {
          gsap.fromTo(el, { scaleY: 0, transformOrigin: "50% 0%" }, { scaleY: 1, ease: "none", scrollTrigger: { trigger: el, start: "top 70%", end: "bottom 70%", scrub: 0.5 } });
        });
        gsap.utils.toArray<HTMLElement>("[data-stack-card]").forEach((el) => {
          gsap.fromTo(el, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 88%" } });
          gsap.fromTo(
            el.querySelectorAll(".odo-strip"),
            { y: 0, yPercent: 0 },
            { yPercent: (_i: number, s: HTMLElement) => -10 * Number(s.dataset.digit), duration: 0.8, stagger: 0.1, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 88%" } },
          );
        });
      });
    },
    { scope: root, dependencies: [paths], revertOnUpdate: true },
  );

  return (
    <section ref={root} aria-labelledby="fork-stack-title" className="pb-16">
      <h2 id="fork-stack-title" className="label mb-6 flex items-center gap-3 text-ink">
        <span>You, now</span>
        <span aria-hidden="true" className="h-px flex-1 bg-ink" />
        <span aria-hidden="true" className="size-4 rounded-full border-[1.5px] border-ink" />
        <span>The fork</span>
      </h2>

      {steps > 0 ? (
        <div className="sticky top-[96px] z-30 mb-8 rounded-full border border-ink bg-paper px-4 py-2">
          <label className="label flex items-center gap-3 text-ink">
            <span className="shrink-0">Stage</span>
            <input
              type="range"
              min={0}
              max={steps}
              step={1}
              value={Math.round(handleT * steps)}
              onChange={(e) => onHandle(Number(e.target.value) / steps)}
              aria-valuetext={stageNameAt(paths, handleT)}
              className="w-full accent-ink"
            />
            <span className="w-[9.5rem] shrink-0 text-right">{stageNameAt(paths, handleT)}</span>
          </label>
        </div>
      ) : null}

      {paths.map((p) => (
        <div key={p.id} className="mb-14" style={{ opacity: opacityFor(focus, p), transition: "opacity .35s" }}>
          <button type="button" onClick={() => onShowDetails(p.id)} className="mb-6 flex items-center gap-3 text-left">
            <Avatar initials={p.initials} color={p.color} size={48} />
            <span>
              <span className="label block" style={{ color: p.color }}>
                {p.roleLabel}
              </span>
              <span className="block font-serif text-2xl leading-tight text-ink">{p.short}</span>
              <span className="label block text-muted">
                {p.card.display_date}
                {p.rating ? ` · fit ${p.rating.analogy_fit}` : ""}
              </span>
            </span>
          </button>
          <ol className="relative ml-[23px] pl-8">
            <span data-stack-line aria-hidden="true" className="absolute top-0 bottom-0 left-0 w-[2px]" style={{ background: p.color }} />
            {p.stops.map((s, i) => {
              const hi = isHighlighted(focus, p, i);
              return (
                <li key={s.key} className="relative mb-5 last:mb-0">
                  <span
                    aria-hidden="true"
                    className={`absolute top-4 -left-[39px] size-4 border-2 transition-colors ${s.key === "lesson" ? "rotate-45" : "rounded-full"}`}
                    style={{ borderColor: p.color, background: hi ? p.color : "#F2EDE4" }}
                  />
                  <article
                    data-stack-card
                    tabIndex={0}
                    onFocus={() => onHover({ source: p.id, t: fractionOf(p, i) })}
                    onBlur={() => onHover(null)}
                    className="border bg-paper p-4 transition-colors"
                    style={{ borderColor: hi ? p.color : "rgba(20,18,15,.16)" }}
                  >
                    <p className="label flex justify-between gap-2" style={{ color: p.color }}>
                      <span>{s.label}</span>
                      {i === 0 ? <Odometer value={p.card.display_date} className="text-muted" /> : null}
                    </p>
                    <p className={`mt-1 leading-relaxed text-ink ${s.key === "lesson" ? "font-serif text-lg italic" : "text-[14px]"}`}>{s.text}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className={`rounded-full border border-ink/25 px-2 py-[3px] font-mono text-[10px] tracking-[1px] text-ink/70 uppercase ${s.type === "interpretation" ? "border-dashed" : ""}`}>
                        {s.type === "interpretation" ? "◇" : "●"} {s.type}
                      </span>
                      {s.claimIds.length ? (
                        <button
                          type="button"
                          onClick={() => onOpenSources(p.card, s.claimIds[0], p.refs)}
                          className="rounded-full border border-ink/25 px-2 py-[3px] font-mono text-[10px] tracking-[1px] text-ink/70 uppercase"
                        >
                          {s.claimIds.map((id) => `[${p.refs[id] ?? "?"}]`).join("")} src ↗
                        </button>
                      ) : null}
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}
