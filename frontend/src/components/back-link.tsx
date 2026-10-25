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
    <Link href={hasResults ? "/#results" : "/"} className="group inline-flex items-center gap-2 text-sm font-medium text-ink">
      <ArrowRight className="rotate-180 transition-transform group-hover:-translate-x-0.5" />
      <span className="underline decoration-ink/25 decoration-[1.5px] underline-offset-[5px] group-hover:decoration-ink">
        {hasResults ? "Back to your results" : "Back to Historical Figure"}
      </span>
    </Link>
  );
}
