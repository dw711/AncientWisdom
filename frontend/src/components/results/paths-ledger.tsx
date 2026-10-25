"use client";

import type { CSSProperties } from "react";
import type { PartialResponse, ReadyResponse } from "@/lib/contracts/advice";
import { lowerFirst, SectionHeading } from "../ui";
import type { Edition } from "../precedent/model";

const NUMERALS = ["I", "II", "III", "IV", "V", "VI"];

const firstSentence = (text: string) => text.match(/^[^]+?[.!?](?=\s|$)/)?.[0] ?? text;

interface Path {
  kicker: string;
  text: string;
  note: string | null;
  basis: Edition[];
}

/**
 * The ways forward side by side: our view, then each conditional alternative,
 * with the editions that back each one. Every link comes from the answer's
 * own `basis_case_ids`; nothing is inferred here.
 */
export function PathsLedger({ response: r, editions }: { response: ReadyResponse | PartialResponse; editions: Edition[] }) {
  const byCase = (ids: string[]) => editions.filter((e) => ids.includes(e.card.case_id));
  const paths: Path[] = [
    ...(r.recommendation
      ? [
          {
            kicker: "Our view",
            // Just the headline sentence: the front page already carries the rest.
            text: firstSentence(r.recommendation.text),
            note: r.recommendation.conditions.length ? `Holds if ${r.recommendation.conditions.map((c) => lowerFirst(c.replace(/\.$/, ""))).join("; ")}.` : null,
            basis: byCase(r.recommendation.basis_case_ids),
          },
        ]
      : []),
    ...r.alternatives.map((a) => ({
      kicker: `If ${lowerFirst(a.condition.replace(/^if\s+/i, "").replace(/\.$/, ""))}…`,
      text: a.action,
      note: null,
      basis: byCase(a.basis_case_ids),
    })),
  ];
  if (!paths.length) return null;

  return (
    <section id="paths" aria-labelledby="paths-h" className="scroll-mt-20 border-t-[6px] border-ink py-12">
      <SectionHeading id="paths-h" numeral="Your paths" title="The ways forward, and the history behind each" bare />
      <ol className={"grid gap-px bg-ink p-px " + (paths.length > 1 ? "md:grid-cols-2 " : "") + (paths.length > 2 ? "lg:grid-cols-3" : "")}>
        {paths.map((p, i) => (
          <li key={i} className="flex flex-col bg-paper p-6">
            <div className="flex items-baseline justify-between gap-4">
              <p className={i === 0 ? "label text-burgundy" : "text-[15px] leading-snug text-ink-soft italic"}>{p.kicker}</p>
              <span aria-hidden="true" className="font-display text-[44px] leading-none text-ink/15 italic">
                {NUMERALS[i]}
              </span>
            </div>
            <p className={"mt-3 font-display text-[24px] leading-[1.15] tracking-[-0.01em] text-ink " + (i === 0 ? "font-black" : "")}>{p.text}</p>
            {p.note ? <p className="mt-3 text-sm leading-relaxed text-ink-soft">{p.note}</p> : null}
            {p.basis.length ? (
              <div className="mt-auto pt-6">
                <p className="label mb-2 text-muted">Drawn from</p>
                <ul className="flex flex-wrap gap-x-4 gap-y-2">
                  {p.basis.map((e) => (
                    <li key={e.id}>
                      <a href={`#edition-${e.letter.toLowerCase()}`} className="group flex items-center gap-2 text-[15px] text-ink" style={{ "--ed": e.color } as CSSProperties}>
                        <span className="grid size-[22px] place-items-center rounded-full bg-[var(--ed)] font-mono text-[11px] text-paper">{e.letter}</span>
                        <span className="underline decoration-ink/20 underline-offset-4 group-hover:decoration-ink">{e.short}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
