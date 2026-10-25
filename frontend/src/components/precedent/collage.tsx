"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatYear } from "@/lib/case-refs";
import { Flip, prefersReducedMotion } from "./gsap";
import type { Edition } from "./model";

interface Tile {
  key: string;
  span: string;
  bg: string;
  fg: string;
  content: ReactNode;
}

/**
 * Initials-and-facts collage of the cases in this edition. Hovering (or
 * pressing Shuffle) reshuffles the tiles with a FLIP animation.
 */
export function Collage({ editions }: { editions: Edition[] }) {
  const tiles = useMemo<Tile[]>(
    () =>
      editions.flatMap((e) => [
        {
          key: `${e.id}-ini`,
          span: "col-span-2 row-span-2",
          bg: e.color,
          fg: "#EDEAE2",
          content: <span className="font-display text-[56px] leading-none italic">{e.initials}</span>,
        },
        { key: `${e.id}-name`, span: "col-span-2", bg: "#EDEAE2", fg: "#111", content: <span className="font-display text-[20px] leading-tight">{e.short}</span> },
        {
          key: `${e.id}-fit`,
          span: "",
          bg: "#111",
          fg: "#EDEAE2",
          content: (
            <span className="text-center">
              <span className="block font-display text-[26px] leading-none">{e.rating ? e.rating.analogy_fit : "—"}</span>
              <span className="label opacity-70">fit</span>
            </span>
          ),
        },
        { key: `${e.id}-year`, span: "", bg: "#EDEAE2", fg: e.color, content: <span className="font-mono text-[16px]">{formatYear(e.card.year_start)}</span> },
      ]),
    [editions],
  );

  const [order, setOrder] = useState(() => tiles.map((t) => t.key));
  const grid = useRef<HTMLDivElement>(null);
  const flipState = useRef<Flip.FlipState | null>(null);
  const [seen, setSeen] = useState(tiles);
  if (seen !== tiles) {
    setSeen(tiles);
    setOrder(tiles.map((t) => t.key));
  }

  const shuffle = () => {
    if (!prefersReducedMotion() && grid.current) flipState.current = Flip.getState(grid.current.children);
    setOrder((o) => {
      const next = [...o];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j]!, next[i]!];
      }
      return next;
    });
  };

  useLayoutEffect(() => {
    if (!flipState.current) return;
    Flip.from(flipState.current, { duration: 0.6, ease: "power3.inOut", stagger: 0.02, absolute: true });
    flipState.current = null;
  }, [order]);

  const byKey = new Map(tiles.map((t) => [t.key, t]));
  if (!tiles.length) return null;

  return (
    <figure className="mt-8">
      <figcaption className="label mb-3 flex items-center justify-between text-ink">
        <span>In this edition</span>
        <button type="button" onClick={shuffle} className="underline-offset-4 hover:underline">
          Shuffle ↻
        </button>
      </figcaption>
      <div ref={grid} onMouseEnter={shuffle} className="grid grid-flow-dense auto-rows-[72px] grid-cols-4 gap-[3px] border border-ink bg-ink p-[3px]">
        {order.map((k) => {
          const t = byKey.get(k);
          if (!t) return null;
          return (
            <div key={k} className={`grid place-items-center overflow-hidden px-2 text-center ${t.span}`} style={{ background: t.bg, color: t.fg }}>
              {t.content}
            </div>
          );
        })}
      </div>
    </figure>
  );
}
