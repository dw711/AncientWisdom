"use client";

import { useRef } from "react";
import type { AnalogyRating } from "@/lib/contracts/advice";
import { gsap, MOTION_OK, useGSAP } from "../precedent/gsap";

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * "How close is this to you?": the overall fit as one bar that fills when it
 * scrolls into view. The per-dimension bars and the rubric legend are folded
 * away; the front page compares the dimensions across editions.
 */
export function FitBars({ rating, color, id }: { rating: AnalogyRating; color: string; id: string }) {
  const root = useRef<HTMLElement>(null);
  const sample = rating.source === "sample";

  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: "top 85%" } });
        tl.from("[data-fill]", { scaleX: 0, duration: 1.1, ease: "power3.out", stagger: 0.12 });
        const els = root.current!.querySelectorAll<HTMLElement>("[data-value]");
        els.forEach((el, i) => {
          const n = { v: 0 };
          const target = Number(el.dataset.value);
          tl.to(n, { v: target, duration: 1.1, ease: "power3.out", onUpdate: () => void (el.textContent = String(Math.round(n.v))) }, i * 0.12);
        });
        return () => els.forEach((el) => void (el.textContent = el.dataset.value!));
      });
    },
    { scope: root, dependencies: [rating], revertOnUpdate: true },
  );

  const dims = rating.dimensions.map((d) => ({ key: d.dimension, label: d.label, value: Math.round(d.normalised * 100) }));
  const bar = (r: { key: string; label: string; value: number }, strong = false) => (
    <div key={r.key} className="grid grid-cols-[minmax(0,150px)_1fr_36px] items-center gap-3">
      <dt className={"text-[15px] text-ink " + (strong ? "font-semibold" : "")}>{r.label}</dt>
      <dd className="relative h-[10px] border border-ink/70" aria-hidden="true">
        <span data-fill className="absolute inset-y-0 left-0 origin-left" style={{ width: `${r.value}%`, background: color }} />
      </dd>
      <dd className="text-right font-mono text-[13px] text-ink tabular-nums">
        <span data-value={r.value}>{r.value}</span>
        <span className="sr-only"> out of 100</span>
      </dd>
    </div>
  );

  return (
    <section ref={root} aria-labelledby={`fit-${id}`} className="mt-8 border-t-[3px] border-ink pt-4">
      <h4 id={`fit-${id}`} className="label mb-4 flex justify-between text-ink">
        <span>How close is this to you?</span>
        {sample ? <span className="text-muted">Sample rating</span> : null}
      </h4>
      <dl>{bar({ key: "overall", label: "Overall fit", value: rating.analogy_fit }, true)}</dl>
      <details className="group mt-4">
        <summary className="label cursor-pointer list-none text-muted hover:text-ink">
          <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span> How it is rated
        </summary>
        <div className="mt-3 space-y-3 text-sm">
          <dl className="space-y-3 pb-2">{dims.map((d) => bar(d))}</dl>
          <p className="leading-relaxed text-ink-soft">
            A rubric rating of how closely this case&apos;s decision resembles yours, <strong className="font-semibold text-ink">not a probability that the advice will work</strong>.
            {sample ? " This sample rating was written for the preview; live ratings come from Jev." : " Each dimension is scored 0–4 by Jev on its pre-decision record, before outcomes are read."}
          </p>
          {rating.dimensions.map((d) => (
            <div key={d.dimension}>
              <p className="flex justify-between gap-3 text-ink">
                <span>{d.label}</span>
                <span className="font-mono text-[11px] text-muted">
                  {d.raw_score.toFixed(d.raw_score % 1 ? 2 : 0)}/4 · weight {pct(rating.weights[d.dimension])}
                </span>
              </p>
              <p className="text-xs leading-relaxed text-ink-soft">{d.legend[String(Math.round(d.raw_score))]}</p>
              {d.confidence !== null ? (
                <p className={d.confidence < 0.35 ? "text-xs text-amber" : "text-xs text-muted"}>
                  Jev confidence {pct(d.confidence)}
                  {d.confidence < 0.35 ? " (low; the rating is uncertain)" : ""}
                </p>
              ) : null}
            </div>
          ))}
          {rating.critical_mismatch_probability !== null ? <p className="text-xs text-muted">Chance Jev assigns to a critical mismatch: {pct(rating.critical_mismatch_probability)}</p> : null}
          <p className="text-xs leading-relaxed text-muted">
            The weights are an application heuristic, not something Jev supplies. Model confidence describes the rating, not the reliability of the sources or the chance of success.
          </p>
        </div>
      </details>
    </section>
  );
}
