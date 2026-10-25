"use client";

import Link from "next/link";
import { useRef, useSyncExternalStore } from "react";
import { gsap, MOTION_OK, useGSAP } from "./gsap";

const TITLE = "The Precedent";
const noop = () => () => {};
const today = () => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

/** "VOL. I · OXHACK EDITION | 以古为鉴 — USE THE PAST AS A MIRROR | today's date" */
export function Dateline({ children }: { children?: React.ReactNode }) {
  // Rendered on the client only, so a prerendered page never shows a stale date.
  const date = useSyncExternalStore(noop, today, () => "");
  return (
    <div className="label grid grid-cols-1 items-center gap-1 border-b border-ink/40 py-2.5 text-center text-ink sm:grid-cols-3 sm:text-left">
      <span>Vol. I · OxHack edition</span>
      <span className="sm:text-center">
        <span style={{ fontFamily: "var(--font-cjk)" }} lang="zh-Hans">
          以古为鉴
        </span>{" "}
        — Use the past as a mirror
      </span>
      <span className="flex items-center justify-center gap-3 sm:justify-end">
        {children}
        <time>{date}</time>
      </span>
    </div>
  );
}

/**
 * The nameplate: thick rule, "The Precedent" letter by letter, thin rule and
 * the strap. On the front page the letters drop in on load.
 */
export function Masthead({ size = "full" }: { size?: "full" | "compact" }) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (size !== "full") return;
      gsap.matchMedia().add(MOTION_OK, () => {
        gsap.from("[data-mast-letter]", { yPercent: -115, rotate: () => gsap.utils.random(-8, 8), duration: 0.9, stagger: 0.045, ease: "power4.out" });
      });
    },
    { scope: root },
  );

  return (
    <header ref={root} id="masthead" className="mt-3">
      <div className="h-[6px] bg-ink" />
      <Link href="/" aria-label={TITLE} className="block">
        <p
          aria-hidden="true"
          className={
            "overflow-hidden text-center font-display leading-[0.95] font-black tracking-[-0.045em] text-ink " +
            (size === "full" ? "py-2 text-[clamp(52px,11.7vw,168px)]" : "py-1 text-[clamp(40px,6vw,72px)]")
          }
        >
          {[...TITLE].map((c, i) => (
            <span key={i} data-mast-letter className="inline-block">
              {c === " " ? " " : c}
            </span>
          ))}
        </p>
      </Link>
      <div className="h-px bg-ink" />
      <p className="label border-b border-ink py-2.5 text-center text-ink">
        Past decisions <span aria-hidden="true">·</span> Present dilemmas <span aria-hidden="true">·</span> Yours to weigh
      </p>
    </header>
  );
}
