import Link from "next/link";
import type { ReactNode } from "react";

/** "以古为鉴 / MIRROR OF THE PAST" on the left, page actions on the right, 1px ink rule below. */
export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-50 h-[52px] border-b border-ink bg-paper">
      <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between gap-4 px-4 md:px-12">
        <Link href="/" className="label flex items-baseline text-ink">
          <span className="font-sans text-[13px] font-semibold tracking-normal" style={{ fontFamily: "var(--font-cjk)" }} lang="zh-Hans">
            以古为鉴
          </span>
          <span className="max-sm:sr-only">
            <span className="mx-2 text-ink/40">/</span>
            Mirror of the past
          </span>
        </Link>
        <nav aria-label="Main" className="label flex items-center gap-4 whitespace-nowrap md:gap-8">
          {children}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-ink/20">
      <div className="label mx-auto flex max-w-[1440px] flex-col gap-1 px-4 py-6 text-muted sm:flex-row sm:justify-between md:px-12">
        <p>以古为鉴 · Mirror of the past · OxHack 2026</p>
        <p>Your description is used only to prepare this answer and is not saved.</p>
      </div>
    </footer>
  );
}
