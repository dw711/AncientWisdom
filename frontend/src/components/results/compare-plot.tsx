"use client";

import type { CSSProperties } from "react";
import type { Dimension } from "@/lib/contracts/advice";
import type { Edition } from "../precedent/model";

const SHORT: Record<Dimension, string> = { structural: "Structure", incentives: "Incentives", constraints: "Constraints", time: "Timing" };

/** Dots closer than this (on the 0–100 scale) would overlap, so they sit side by side. */
const NEAR = 7;
const DOT = 24;

/** Horizontal pixel nudges that spread each cluster of near-equal values around its centre. */
function spread(values: number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const nudge = new Array<number>(values.length).fill(0);
  for (let start = 0; start < order.length; ) {
    let end = start + 1;
    while (end < order.length && order[end]!.v - order[end - 1]!.v < NEAR) end++;
    const size = end - start;
    for (let k = start; k < end; k++) nudge[order[k]!.i] = (k - start - (size - 1) / 2) * DOT;
    start = end;
  }
  return nudge;
}

/**
 * How the editions compare: one row per rubric dimension (overall first), a
 * 0–100 track, and a lettered dot per edition, so the letter carries identity
 * as well as the colour. Tied scores sit side by side rather than hiding each
 * other; hovering a dot names it and its exact score.
 */
export function ComparePlot({ editions }: { editions: Edition[] }) {
  const rated = editions.filter((e) => e.rating);
  if (rated.length < 1) return null;
  const dims = rated[0]!.rating!.dimensions.map((d) => d.dimension);
  const scales: { key: string; label: string; value: (e: Edition) => number }[] = [
    { key: "overall", label: "Overall fit", value: (e) => e.rating!.analogy_fit },
    ...dims.map((dim) => ({
      key: dim,
      label: SHORT[dim],
      value: (e: Edition) => Math.round((e.rating!.dimensions.find((d) => d.dimension === dim)?.normalised ?? 0) * 100),
    })),
  ];
  const rows = scales.map((s) => ({ ...s, nudge: spread(rated.map(s.value)) }));

  return (
    <figure>
      <figcaption className="label mb-3 text-muted">How closely each case matches yours</figcaption>
      <div aria-hidden="true" className="space-y-1">
        {rows.map((row, ri) => (
          <div key={row.key} className="grid grid-cols-[88px_1fr] items-center gap-3">
            <span className={"text-[14px] " + (ri === 0 ? "font-semibold text-ink" : "text-ink-soft")}>{row.label}</span>
            <div className={"relative h-8 " + (ri === 0 ? "border-b border-ink" : "border-b border-ink/15")}>
              {/* Recessive quarter gridlines. */}
              {[25, 50, 75].map((t) => (
                <span key={t} className="absolute inset-y-1 w-px bg-ink/10" style={{ left: `${t}%` }} />
              ))}
              {rated.map((e, i) => {
                const v = row.value(e);
                const dx = row.nudge[i]!;
                return (
                  <span
                    key={e.id}
                    data-dot
                    className="group absolute top-1/2 grid size-[22px] -translate-x-1/2 -translate-y-1/2 cursor-default place-items-center rounded-full bg-[var(--ed)] font-mono text-[11px] text-paper ring-2 ring-paper hover:z-10"
                    style={{ left: `calc(${v}% + ${dx}px)`, "--ed": e.color } as CSSProperties}
                  >
                    {e.letter}
                    <span className="label pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 bg-ink px-2 py-1 whitespace-nowrap text-paper group-hover:block">
                      {e.short} · {v}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        ))}
        <div className="grid grid-cols-[88px_1fr] gap-3">
          <span />
          <div className="label flex justify-between text-muted">
            <span>0</span>
            <span>100</span>
          </div>
        </div>
      </div>
      <table className="sr-only">
        <caption>Rubric fit of each case to your decision, 0 to 100</caption>
        <thead>
          <tr>
            <th scope="col">Case</th>
            {rows.map((r) => (
              <th key={r.key} scope="col">
                {r.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rated.map((e) => (
            <tr key={e.id}>
              <th scope="row">
                Edition {e.letter}: {e.short}
              </th>
              {rows.map((r) => (
                <td key={r.key}>{r.value(e)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
