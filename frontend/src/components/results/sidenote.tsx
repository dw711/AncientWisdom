"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { brief } from "@/lib/case-refs";

export interface Note {
  n: number | string;
  text: string;
  source: string | null;
}

const WIDTH = 300;

/**
 * A citation mark that previews its source passage in a margin card on hover
 * or focus, Tufte-style. Clicking still opens the full sources drawer.
 */
export function NoteRef({ note, onOpen }: { note: Note; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  const show = () => {
    const r = ref.current!.getBoundingClientRect();
    const x = Math.min(Math.max(12, r.left + r.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - 12);
    // Above the mark when there is no room below. Placed with `bottom`, not a
    // transform, because the rise animation owns `transform`.
    setPos(r.bottom + 220 > window.innerHeight ? { left: x, bottom: window.innerHeight - r.top + 10 } : { left: x, top: r.bottom + 10 });
  };
  const hide = () => setPos(null);

  useEffect(() => {
    if (!pos) return;
    window.addEventListener("scroll", hide, { passive: true });
    return () => window.removeEventListener("scroll", hide);
  }, [pos]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={onOpen}
        // Touch has no hover: a tap goes straight to the drawer.
        onPointerEnter={(e) => e.pointerType === "mouse" && show()}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-describedby={pos ? id : undefined}
        aria-label={`Source passage ${note.n}`}
        className="px-0.5 text-muted hover:bg-ink hover:text-paper focus-visible:bg-ink focus-visible:text-paper"
      >
        [{note.n}]
      </button>
      {pos
        ? createPortal(
            <div
              id={id}
              role="tooltip"
              style={{ ...pos, width: WIDTH }}
              className="pointer-events-none fixed z-[90] animate-rise border border-ink bg-card p-4 text-left shadow-[0_18px_40px_-18px_rgba(0,0,0,.5)]"
            >
              <p className="label mb-2 text-burgundy">Source [{note.n}]</p>
              <p className="text-[15px] leading-snug text-ink italic">“{brief(note.text, 260)}”</p>
              {note.source ? <p className="label mt-3 text-muted">{note.source}</p> : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
