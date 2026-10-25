import type { ReactNode } from "react";
import { Dateline, Masthead } from "./precedent/masthead";

/** Dateline row plus the nameplate. `children` sit in the dateline (e.g. the mode badge). */
export function SiteHeader({ children, size = "compact" }: { children?: ReactNode; size?: "full" | "compact" }) {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 md:px-10">
      <Dateline>{children}</Dateline>
      <Masthead size={size} />
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t-[6px] border-ink">
      <div className="label mx-auto flex max-w-[1280px] flex-col gap-1 px-4 py-6 text-muted sm:flex-row sm:justify-between md:px-10">
        <p>The Precedent · 以古为鉴 · OxHack 2026</p>
        <p>Your letter is used only to prepare this edition and is not saved.</p>
      </div>
    </footer>
  );
}
