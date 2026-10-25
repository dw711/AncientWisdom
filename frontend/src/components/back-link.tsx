"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { recall } from "@/lib/client/session-memory";
import { ArrowRight } from "./ui";

const noop = () => () => {};

/** Returns to the results when there are some in memory, otherwise to the start page. */
export function BackLink() {
  const hasResults = useSyncExternalStore(
    noop,
    () => Boolean(recall()?.response),
    () => false,
  );
  return (
    <Link href={hasResults ? "/#results" : "/"} className="group inline-flex items-center gap-2 text-sm font-semibold text-ink">
      <ArrowRight className="rotate-180 text-accent-ink transition-transform duration-300 ease-out-soft group-hover:-translate-x-1" />
      <span className="underline decoration-accent/50 decoration-1 underline-offset-[6px] transition-[text-decoration-color] group-hover:decoration-ink">
        {hasResults ? "Back to your results" : "Back to Historical Figure"}
      </span>
    </Link>
  );
}
