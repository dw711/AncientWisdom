"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdviceRequestInput, AdviceResponse, ApiError, CaseCard, ConstraintKey, HealthResponse } from "@/lib/contracts/advice";
import { LIMITS } from "@/lib/contracts/advice";
import { requestAdvice } from "@/lib/client/advice-client";
import { applyUpdate, EMPTY_CONTEXT, toConstraints, type ContextForm } from "@/lib/client/context-form";
import { recall, remember } from "@/lib/client/session-memory";
import { DilemmaForm } from "./dilemma-form";
import { ProgressPanel, type ProgressEntry } from "./progress-panel";
import { ResultsView } from "./results/results-view";
import { SiteFooter, SiteHeader } from "./site-header";
import { SourceDrawer } from "./source-drawer";
import { Button } from "./ui";

type Phase =
  | { kind: "idle" }
  | { kind: "loading"; entries: ProgressEntry[] }
  | { kind: "result"; response: AdviceResponse }
  | { kind: "error"; httpStatus: number; error: ApiError["error"]; requestId: string | null };

const CJK = /[㐀-鿿]/;

export function HistoricalFigureApp() {
  // Restored when returning from a story page; empty on a fresh load.
  const [saved] = useState(recall);
  const [query, setQuery] = useState(saved?.query ?? "");
  const [context, setContext] = useState<ContextForm>(saved?.context ?? EMPTY_CONTEXT);
  const [contextOpen, setContextOpen] = useState(saved?.contextOpen ?? false);
  const [phase, setPhase] = useState<Phase>(saved?.response ? { kind: "result", response: saved.response } : { kind: "idle" });
  const [formError, setFormError] = useState<string | null>(null);
  // Once there is a result, the question collapses to one line so the timeline leads.
  const [editing, setEditing] = useState(false);
  const [changedLabel, setChangedLabel] = useState<string | null>(saved?.changedLabel ?? null);
  const [drawer, setDrawer] = useState<{ card: CaseCard; claimId: string | null; refs: Record<string, number> | null } | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  const seq = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const lastResponse = useRef<AdviceResponse | null>(saved?.response ?? null);

  // Keep the in-memory copy current so a story page can link back to these results.
  useEffect(() => {
    remember({ query, context, contextOpen, response: phase.kind === "result" ? phase.response : lastResponse.current, changedLabel });
  }, [query, context, contextOpen, phase, changedLabel]);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json() as Promise<HealthResponse>)
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  const run = useCallback(
    async (opts: { context?: ContextForm; clarifications?: { question: string; answer: string }[]; changed?: string | null } = {}) => {
      const text = query.trim();
      if (text.length < LIMITS.queryMin) {
        setFormError(`Please describe the dilemma in a little more detail (at least ${LIMITS.queryMin} characters).`);
        return;
      }
      setFormError(null);
      // Newer requests always win: abort the previous one and ignore anything it still returns.
      controller.current?.abort();
      const ac = new AbortController();
      controller.current = ac;
      const mySeq = ++seq.current;
      const ctx = opts.context ?? context;
      const body: AdviceRequestInput = {
        query: text,
        language: CJK.test(text) ? "zh" : "en",
        max_cases: LIMITS.maxCases,
        constraints: toConstraints(ctx),
        clarifications: opts.clarifications ?? [],
      };
      setChangedLabel(opts.changed ?? null);
      setEditing(false);
      setPhase({ kind: "loading", entries: [] });
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));

      try {
        const outcome = await requestAdvice(body, {
          signal: ac.signal,
          onProgress: (stage, message) => {
            if (mySeq !== seq.current) return;
            setPhase((p) => (p.kind === "loading" ? { kind: "loading", entries: [...p.entries, { stage, message }] } : p));
          },
        });
        if (mySeq !== seq.current) return;
        if (outcome.ok) {
          lastResponse.current = outcome.response;
          setPhase({ kind: "result", response: outcome.response });
        } else {
          setPhase({ kind: "error", httpStatus: outcome.httpStatus, error: outcome.error, requestId: outcome.requestId });
        }
      } catch {
        // Aborted: a newer request or the user's cancel has taken over.
        if (mySeq === seq.current) {
          setPhase(lastResponse.current ? { kind: "result", response: lastResponse.current } : { kind: "idle" });
        }
      }
    },
    [query, context],
  );

  const cancel = () => {
    controller.current?.abort();
  };

  const editContext = () => {
    setEditing(true);
    setContextOpen(true);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const applyChange = (key: ConstraintKey, value: string | number | boolean, label: string) => {
    const next = applyUpdate(context, key, value);
    setContext(next);
    setContextOpen(true);
    void run({ context: next, changed: label });
  };

  const busy = phase.kind === "loading";
  const response = phase.kind === "result" ? phase.response : null;
  const compact = phase.kind !== "idle" && !editing;

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader>
        {health ? (
          <span
            className={
              "rounded-full border px-2.5 py-1 text-xs " + (health.mode === "live" ? "border-moss/30 bg-moss-wash text-moss" : "border-bronze/30 bg-bronze-wash text-bronze")
            }
            title={health.mode === "live" ? "Live analysis with Jev and a language model" : "Preview: prewritten sample analyses for the example dilemmas"}
          >
            {health.mode === "live" ? "Live" : "Preview mode"}
          </span>
        ) : null}
      </SiteHeader>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-24 sm:px-8">
        {compact ? (
          <section className="flex flex-col gap-4 border-b border-rule-soft pt-8 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-[0.68rem] font-semibold tracking-[0.14em] text-muted uppercase">Your question</p>
              <p className="mt-1 line-clamp-2 max-w-3xl font-serif text-lg leading-snug text-ink">{query}</p>
            </div>
            <Button variant="secondary" className="shrink-0 self-start sm:self-auto" disabled={busy} onClick={() => setEditing(true)}>
              Edit question
            </Button>
          </section>
        ) : (
          <section className="grid gap-10 pt-12 pb-10 sm:pt-16 lg:grid-cols-[1fr_minmax(0,34rem)] lg:gap-14">
            <div className="lg:pt-2">
              <h1 className="font-serif text-[2.35rem] leading-[1.08] tracking-tight text-ink sm:text-[3.1rem]">What can history teach your next decision?</h1>
              <p className="mt-5 max-w-md text-[1.05rem] leading-relaxed text-ink-soft">
                Describe a choice you are facing. Historical Figure finds sourced decisions from the past with a similar structure, shows what they share with yours and where
                they differ, and suggests what to do next, along with what would change that advice.
              </p>
              <p className="mt-6 max-w-md border-l-2 border-bronze/50 pl-4 text-sm leading-relaxed text-muted">
                Historical comparisons have limits. Circumstances differ, sources disagree, and a past outcome does not predict yours. Treat the advice as one input to your own
                judgement.
              </p>
            </div>
            <div ref={formRef} className="scroll-mt-6">
              <DilemmaForm
                query={query}
                onQueryChange={(q) => {
                  setQuery(q);
                  if (formError) setFormError(null);
                }}
                context={context}
                onContextChange={setContext}
                contextOpen={contextOpen}
                onContextOpenChange={setContextOpen}
                onSubmit={() => void run()}
                onCancel={cancel}
                onPreset={(q) => {
                  setQuery(q);
                  setContext(EMPTY_CONTEXT);
                  setFormError(null);
                }}
                busy={busy}
                error={formError}
              />
            </div>
          </section>
        )}

        <div ref={resultsRef} id="results" className="scroll-mt-6 pt-8">
          {phase.kind === "loading" ? (
            <div className="mx-auto max-w-3xl">
              <ProgressPanel entries={phase.entries} waitingFor={null} />
            </div>
          ) : null}
          {phase.kind === "error" ? (
            <div role="alert" className="mx-auto max-w-3xl animate-rise rounded-lg border border-burgundy/30 bg-burgundy-wash/50 px-6 py-5">
              <p className="font-serif text-lg text-ink">{phase.error.code === "rate_limited" ? "Please wait a moment" : "The analysis could not be completed"}</p>
              <p className="mt-1 leading-relaxed text-ink-soft">{phase.error.message}</p>
              {phase.error.details?.length ? (
                <ul className="mt-2 list-disc pl-5 text-sm text-ink-soft">
                  {phase.error.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-2 text-sm text-muted">Your description and context are unchanged. No advice was produced.</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button onClick={() => void run()}>Try again</Button>
                {phase.requestId ? <span className="font-mono text-[0.68rem] text-muted">{phase.requestId}</span> : null}
              </div>
            </div>
          ) : null}
          {response ? (
            <div className={busy ? "opacity-50" : undefined}>
              <ResultsView
                response={response}
                changedLabel={changedLabel}
                busy={busy}
                onOpenSources={(card, claimId, refs) => setDrawer({ card, claimId: claimId ?? null, refs: refs ?? null })}
                onApplyChange={applyChange}
                onEditContext={editContext}
                onClarify={(answers) => void run({ clarifications: answers })}
              />
            </div>
          ) : null}
        </div>
      </main>

      <SiteFooter />

      <SourceDrawer
        card={drawer?.card ?? null}
        focusClaimId={drawer?.claimId ?? null}
        refs={drawer?.refs ?? null}
        evidence={response ? { claims: response.claims, passages: response.passages, sources: response.sources } : { claims: [], passages: [], sources: [] }}
        onClose={() => setDrawer(null)}
      />
    </div>
  );
}
