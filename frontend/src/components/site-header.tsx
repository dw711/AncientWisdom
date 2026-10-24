import Link from "next/link";
import type { ReactNode } from "react";

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="border-b border-rule-soft">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link href="/" className="group flex items-baseline gap-3">
          <span className="font-serif text-xl tracking-tight text-ink">Historical Figure</span>
          <span className="text-sm tracking-[0.2em] text-burgundy/80" style={{ fontFamily: "var(--font-cjk)" }} lang="zh-Hans">
            以古为鉴
          </span>
        </Link>
        {children}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-rule-soft">
      <div className="mx-auto flex max-w-5xl flex-col gap-1 px-5 py-6 text-xs text-muted sm:flex-row sm:justify-between sm:px-8">
        <p>Historical Figure · 以古为鉴 · OxHack 2026</p>
        <p>Your description is used only to prepare this answer and is not saved.</p>
      </div>
    </footer>
  );
}
