import Link from "next/link";
import type { ReactNode } from "react";
import { CJK_FONT, cx } from "./ui";

/** The site mark: 鉴 ("mirror"), from 以古为鉴, "use the past as a mirror". */
export function Mark({ size = "md", tone = "ink" }: { size?: "sm" | "md" | "lg"; tone?: "ink" | "glass" }) {
  return (
    <span
      aria-hidden="true"
      lang="zh-Hans"
      style={CJK_FONT}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-lg leading-none text-white",
        size === "sm" && "size-8 text-base",
        size === "md" && "size-9 text-[1.15rem]",
        size === "lg" && "size-10 text-[1.2rem]",
        tone === "ink" ? "bg-ink" : "bg-white/10",
      )}
    >
      鉴
    </span>
  );
}

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="relative z-20">
      <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-4 px-4 py-4 sm:px-10 sm:py-5">
        <Link href="/" className="flex items-center gap-3">
          <Mark />
          <span className="text-[1.05rem] font-semibold tracking-[-0.025em] text-ink">Historical Figure</span>
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
      <div className="mx-auto max-w-[90rem] px-4 pt-16 pb-10 sm:px-10 sm:pt-24">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3">
            <Mark size="sm" />
            <span className="font-semibold tracking-[-0.025em]">Historical Figure</span>
            <span className="text-sm tracking-[0.2em] text-muted" style={CJK_FONT} lang="zh-Hans">
              以古为鉴
            </span>
          </div>
          <p className="max-w-md text-sm font-light text-ink-soft sm:text-right">Your description is used only to prepare this answer and is not saved.</p>
        </div>
        <div className="dots-b mt-8 h-px" />
        <div className="mt-5 flex flex-col gap-1 text-sm font-light text-ink-soft sm:flex-row sm:justify-between">
          <p>OxHack 2026</p>
          <p>Historical comparisons inform your judgement. They do not replace it.</p>
        </div>
      </div>
    </footer>
  );
}
