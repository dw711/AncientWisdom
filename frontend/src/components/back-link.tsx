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
    <Link href={hasResults ? "/#results" : "/"} className="label text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
      ← {hasResults ? "Back to your results" : "Back to the start"}
    </Link>
  );
}
