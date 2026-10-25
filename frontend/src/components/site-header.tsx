import Link from "next/link";
import type { ReactNode } from "react";
import { CJK_FONT, cx } from "./ui";

/** The site mark: a cinnabar seal, after 以古为鉴, "use the past as a mirror". */
export function Mark({ size = "md", tone = "ink" }: { size?: "sm" | "md" | "lg"; tone?: "ink" | "glass" }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "seal inline-block shrink-0",
        size === "sm" && "size-8",
        size === "md" && "size-9",
        size === "lg" && "size-10",
        tone === "glass" && "brightness-125",
      )}
    />
  );
}

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="relative z-20">
      <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-4 border-b border-rule-soft px-4 py-4 sm:px-10 sm:py-5">
        <Link href="/" className="group flex items-center gap-3 rounded-[2px]">
          <span className="transition-transform duration-500 ease-out-soft group-hover:rotate-[-8deg]">
            <Mark />
          </span>
          <span className="display text-[1.3rem] leading-none text-ink italic">Historical Figure</span>
          <span className="hidden text-sm tracking-[0.2em] text-muted sm:inline" style={CJK_FONT} lang="zh-Hans">
            以古为鉴
          </span>
        </Link>
        {children ? <div className="flex items-center gap-3">{children}</div> : null}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto">
      <div className="mx-auto max-w-[90rem] px-4 pt-20 pb-10 sm:px-10 sm:pt-32">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3">
            <Mark size="sm" />
            <span className="display text-[1.5rem] leading-none italic">Historical Figure</span>
            <span className="text-sm tracking-[0.2em] text-muted" style={CJK_FONT} lang="zh-Hans">
              以古为鉴
            </span>
          </div>
          <p className="max-w-md text-sm text-ink-soft sm:text-right">Your description is used only to prepare this answer and is not saved.</p>
        </div>
        <div className="mt-10 h-px bg-rule" />
        <div className="mt-5 flex flex-col gap-1 text-[0.8125rem] text-muted sm:flex-row sm:justify-between">
          <p>OxHack 2026</p>
          <p>Historical comparisons inform your judgement. They do not replace it.</p>
        </div>
      </div>
    </footer>
  );
}
