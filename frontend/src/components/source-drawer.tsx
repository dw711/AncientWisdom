"use client";

import { useEffect, useRef, useState } from "react";
import type { CaseCard, CaseDetailResponse, ClaimView, PassageView, SourceView } from "@/lib/contracts/advice";
import { CaseEvidence } from "./evidence-list";
import { CloseButton } from "./ui";

export interface Evidence {
  claims: ClaimView[];
  passages: PassageView[];
  sources: SourceView[];
}

interface Props {
  card: CaseCard | null;
  focusClaimId: string | null;
  /** Reference numbers shown on the card, so [2] on the card matches [2] here. */
  refs: Record<string, number> | null;
  evidence: Evidence;
  onClose: () => void;
}

/**
 * Supporting claims, exact passages and source metadata for one case. Uses
 * the evidence already in the response, and falls back to GET /api/cases/:id.
 */
export function SourceDrawer({ card, focusClaimId, refs, evidence, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [fetched, setFetched] = useState<{ caseId: string; data: Evidence } | { caseId: string; error: true } | null>(null);
  const caseId = card?.case_id ?? null;
  const local = caseId ? evidence.claims.filter((c) => c.case_id === caseId) : [];
  const needsFetch = Boolean(caseId) && local.length === 0;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (card && !dialog.open) dialog.showModal();
    if (!card && dialog.open) dialog.close();
  }, [card]);

  useEffect(() => {
    if (!needsFetch || !caseId || (fetched && fetched.caseId === caseId)) return;
    const controller = new AbortController();
    fetch(`/api/cases/${encodeURIComponent(caseId)}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<CaseDetailResponse>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => setFetched({ caseId, data: { claims: d.claims, passages: d.passages, sources: d.sources } }))
      .catch(() => {
        if (!controller.signal.aborted) setFetched({ caseId, error: true });
      });
    return () => controller.abort();
  }, [needsFetch, caseId, fetched]);

  useEffect(() => {
    if (!card || !focusClaimId) return;
    const el = document.getElementById(`claim-${focusClaimId}`);
    el?.scrollIntoView({ block: "center" });
    el?.focus({ preventScroll: true });
  }, [card, focusClaimId, fetched]);

  const data: Evidence | null = !caseId
    ? null
    : !needsFetch
      ? evidence
      : fetched && fetched.caseId === caseId && "data" in fetched
        ? fetched.data
        : null;
  const failed = Boolean(needsFetch && fetched && fetched.caseId === caseId && "error" in fetched);
  const claims = data && caseId ? data.claims.filter((c) => c.case_id === caseId) : [];

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-labelledby="drawer-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      {card ? (
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-rule px-6 pt-7 pb-6 sm:px-10">
            <div>
              <p className="eyebrow text-accent-ink">Sources and passages</p>
              <h2 id="drawer-title" className="display mt-3 text-[2.1rem] leading-[1.05] text-ink">
                {card.title}
              </h2>
              <p className="mt-2 text-sm text-muted">{card.date_detail}</p>
            </div>
            <CloseButton onClick={() => ref.current?.close()} label="Close sources" />
          </header>

          <div className="flex-1 space-y-8 overflow-y-auto px-6 py-7 sm:px-10">
            {!data && !failed ? <p className="text-sm text-muted">Loading sources…</p> : null}
            {failed ? <p className="text-sm text-danger">The sources for this case could not be loaded. Please try again.</p> : null}

            {data ? (
              <CaseEvidence card={card} claims={claims} passages={data.passages} sources={data.sources} refs={refs} focusClaimId={focusClaimId} />
            ) : null}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
