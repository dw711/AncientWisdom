"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { recall } from "@/lib/client/session-memory";

const noop = () => () => {};

/** Returns to the results when there are some in memory, otherwise to the start page. */
export function BackLink() {
  const hasResults = useSyncExternalStore(
    noop,
    () => Boolean(recall()?.response),
    () => false,
  );
  return (
    <Link href={hasResults ? "/#results" : "/"} className="text-sm font-medium text-burgundy underline decoration-burgundy/30 underline-offset-4 hover:decoration-burgundy">
      ← {hasResults ? "Back to your results" : "Back to Historical Figure"}
    </Link>
  );
}
