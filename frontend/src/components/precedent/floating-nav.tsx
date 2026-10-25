"use client";

import { useEffect, useState } from "react";
import { ScrollTrigger } from "./gsap";

export interface NavSection {
  id: string;
  label: string;
}

/**
 * Sits open at the top of the page; once the masthead scrolls away it docks
 * into a compact black pill naming the section being read. On phones the
 * docked pill folds the sections into a menu.
 */
export function FloatingNav({ sections }: { sections: NavSection[] }) {
  const [docked, setDocked] = useState(false);
  const [active, setActive] = useState<string | undefined>(sections[0]?.id);
  const [progress, setProgress] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const key = sections.map((s) => s.id).join("|");

  useEffect(() => {
    const ids = key.split("|").filter(Boolean);
    const triggers = [
      ScrollTrigger.create({
        trigger: "#masthead",
        start: "bottom top+=40",
        end: () => `+=${document.documentElement.scrollHeight}`,
        onToggle: (self) => {
          setDocked(self.isActive);
          if (!self.isActive) setMenuOpen(false);
        },
      }),
      ScrollTrigger.create({ start: 0, end: "max", onUpdate: (self) => setProgress(self.progress) }),
      ...ids
        .filter((id) => document.getElementById(id))
        .map((id) =>
          ScrollTrigger.create({
            trigger: `#${id}`,
            start: "top 45%",
            end: "bottom 45%",
            onToggle: (self) => {
              if (self.isActive) setActive(id);
            },
          }),
        ),
    ];
    return () => triggers.forEach((t) => t.kill());
  }, [key]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);

  const current = sections.find((s) => s.id === active);
  if (sections.length < 2) return null;

  return (
    <nav
      aria-label="Sections"
      className={
        "label fixed top-3 left-1/2 z-50 -translate-x-1/2 transition-all duration-500 " +
        (docked
          ? "rounded-full bg-ink px-2 py-1.5 text-paper shadow-[0_8px_24px_-8px_rgba(0,0,0,.45)]"
          : // Phones have no room for the open list; the masthead is in view anyway.
            "border-y border-ink/30 bg-paper/90 px-2 py-1 text-ink max-sm:hidden")
      }
    >
      <div className="flex items-center gap-1">
        <a
          href="#masthead"
          tabIndex={docked ? 0 : -1}
          className={
            "overflow-hidden font-display text-[17px] font-black tracking-[-0.02em] whitespace-nowrap normal-case transition-all duration-500 " +
            (docked ? "max-w-[160px] px-3 opacity-100" : "max-w-0 px-0 opacity-0")
          }
        >
          The Precedent
        </a>
        {docked && current ? (
          <span className="hidden border-l border-paper/30 px-3 whitespace-nowrap text-paper/60 md:inline" aria-live="polite">
            Now reading: {current.label}
          </span>
        ) : null}
        {docked ? (
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="section-menu"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-full border border-paper/30 px-3 py-1.5 whitespace-nowrap md:hidden"
          >
            {current?.label ?? "Sections"}
            <span aria-hidden="true" className={"transition-transform " + (menuOpen ? "rotate-180" : "")}>
              ⌄
            </span>
          </button>
        ) : null}
        <ul className={"flex items-center " + (docked ? "max-md:hidden" : "max-sm:hidden")}>
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={active === s.id ? "location" : undefined}
                className={
                  "block rounded-full px-3 py-1.5 whitespace-nowrap transition-colors " +
                  (active === s.id ? (docked ? "bg-paper text-ink" : "underline underline-offset-4") : "hover:opacity-70")
                }
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
      {docked && menuOpen ? (
        <ul id="section-menu" className="absolute top-full right-0 mt-2 min-w-[12rem] overflow-hidden rounded-2xl bg-ink py-2 shadow-[0_8px_24px_-8px_rgba(0,0,0,.45)] md:hidden">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                onClick={() => setMenuOpen(false)}
                aria-current={active === s.id ? "location" : undefined}
                className={"block px-4 py-2.5 " + (active === s.id ? "text-paper" : "text-paper/60 hover:text-paper")}
              >
                {active === s.id ? "● " : ""}
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {docked ? <span aria-hidden="true" className="absolute inset-x-5 -bottom-px h-[2px] origin-left bg-burgundy" style={{ transform: `scaleX(${progress})` }} /> : null}
    </nav>
  );
}
