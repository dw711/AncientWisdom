"use client";

import { useMemo, type ReactNode } from "react";
import { formatYear } from "@/lib/case-refs";
import type { Edition } from "./model";

interface Tile {
  key: string;
  /** Columns and rows the tile spans in the four-column grid. */
  w: number;
  h: number;
  bg: string;
  fg: string;
  content: ReactNode;
}

/** Initials-and-facts collage of the cases in this edition. */
export function Collage({ editions }: { editions: Edition[] }) {
  const tiles = useMemo<Tile[]>(
    () =>
      editions.flatMap((e) => [
        {
          key: `${e.id}-ini`,
          w: 2,
          h: 2,
          bg: e.color,
          fg: "#EDEAE2",
          content: <span className="font-display text-[56px] leading-none italic">{e.initials}</span>,
        },
        { key: `${e.id}-name`, w: 2, h: 1, bg: "#EDEAE2", fg: "#111", content: <span className="font-display text-[20px] leading-tight">{e.short}</span> },
        {
          key: `${e.id}-fit`,
          w: 1,
          h: 1,
          bg: "#111",
          fg: "#EDEAE2",
          content: (
            <span className="text-center">
              <span className="block font-display text-[26px] leading-none">{e.rating ? e.rating.analogy_fit : "—"}</span>
              <span className="label opacity-70">fit</span>
            </span>
          ),
        },
        { key: `${e.id}-year`, w: 1, h: 1, bg: "#EDEAE2", fg: e.color, content: <span className="font-mono text-[16px]">{formatYear(e.card.year_start)}</span> },
      ]),
    [editions],
  );

  if (!tiles.length) return null;

  return (
    <figure className="mt-8">
      <figcaption className="label mb-3 text-ink">In this edition</figcaption>
      <ul className="sr-only">
        {editions.map((e) => (
          <li key={e.id}>
            Edition {e.letter}: {e.short}, {formatYear(e.card.year_start)}
            {e.rating ? `, fit ${e.rating.analogy_fit} out of 100` : ""}
          </li>
        ))}
      </ul>
      <div aria-hidden="true" className="grid grid-flow-dense auto-rows-[72px] grid-cols-4 gap-[3px] border border-ink bg-ink p-[3px]">
        {tiles.map((t) => (
          <div
            key={t.key}
            className="grid place-items-center overflow-hidden px-2 text-center"
            style={{ background: t.bg, color: t.fg, gridColumn: `span ${t.w}`, gridRow: `span ${t.h}` }}
          >
            {t.content}
          </div>
        ))}
      </div>
    </figure>
  );
}
