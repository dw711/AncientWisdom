"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdviceRequestInput, AdviceResponse, ApiError, CaseCard, ConstraintKey, DecisionProfile, HealthResponse } from "@/lib/contracts/advice";
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

  const profile = response && "profile" in response ? response.profile : null;
  const shape = shapeOf(profile);

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setEditing(true);
            requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
          }}
          className="hover:underline disabled:opacity-50"
        >
          New dilemma
        </button>
        <span aria-disabled="true" title="Coming soon" className="hidden text-ink/40 sm:inline">
          Library
        </span>
        <a href="#method" className="hover:underline">
          Method
        </a>
        {health ? (
          <span
            className={"hidden rounded-full border px-2.5 py-1 sm:inline " + (health.mode === "live" ? "border-moss/50 text-moss" : "border-ink/30 text-muted")}
            title={health.mode === "live" ? "Live analysis with Jev and a language model" : "Preview: prewritten sample analyses for the example dilemmas"}
          >
            {health.mode === "live" ? "Live" : "Preview"}
          </span>
        ) : null}
      </SiteHeader>

      <main className="w-full flex-1">
        {compact ? (
          <section aria-labelledby="dilemma-title" className="mx-auto grid max-w-[1440px] gap-10 px-4 pt-14 pb-14 md:px-12 lg:grid-cols-12 lg:gap-8 lg:pt-20">
            <figure className="min-w-0 lg:col-span-8">
              <figcaption id="dilemma-title" className="label mb-6 text-muted">
                Your dilemma
              </figcaption>
              <blockquote className="max-w-[26ch] font-serif text-[30px] leading-[1.15] text-ink italic md:text-[44px]">
                <p className="line-clamp-6">
                  <span aria-hidden="true" className="-ml-[0.45em]">
                    “
                  </span>
                  {query.trim()}”
                </p>
              </blockquote>
              <Button variant="secondary" className="mt-8" disabled={busy} onClick={() => setEditing(true)}>
                Edit question
              </Button>
            </figure>
            <aside aria-labelledby="shape-title" className="border-t border-ink pt-4 lg:col-span-4 lg:mt-12">
              <h2 id="shape-title" className="label mb-3 text-ink">
                The shape of it
              </h2>
              {shape.length ? (
                <ol className="divide-y divide-ink/15">
                  {shape.map((t, i) => (
                    <li key={t} className="flex items-baseline gap-4 py-3">
                      <span className="label text-muted">{String(i + 1).padStart(2, "0")}</span>
                      <span className="text-[16px] text-ink">{t}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="py-3 text-sm text-muted">{busy ? "Reading the structure of your decision…" : "Not read yet."}</p>
              )}
              <p className="mt-3 text-[13px] leading-relaxed text-muted">Matched to history on structure, incentives, constraints and timing, not on topic.</p>
            </aside>
          </section>
        ) : (
          <section className="mx-auto grid max-w-[1440px] gap-12 px-4 pt-14 pb-16 md:px-12 lg:grid-cols-12 lg:gap-8 lg:pt-24">
            <div className="lg:col-span-6">
              <p className="label text-muted">以古为鉴 — Use the past as a mirror</p>
              <h1 className="mt-6 max-w-[14ch] font-serif text-[2.6rem] leading-[1.05] text-ink italic sm:text-[3.6rem]">What can history teach your next decision?</h1>
              <p className="mt-6 max-w-md text-[1.05rem] leading-relaxed text-ink-soft">
                Describe a choice you are facing. We find sourced decisions from the past with a similar structure, draw the path each one took, show where it resembles
                yours and where it differs, and suggest what to do next, along with what would change that advice.
              </p>
              <p className="mt-6 max-w-md border-l border-ink pl-4 text-sm leading-relaxed text-muted">
                Historical comparisons have limits. Circumstances differ, sources disagree, and a past outcome does not predict yours. Treat the advice as one input to your own
                judgement.
              </p>
            </div>
            <div ref={formRef} className="scroll-mt-24 lg:col-span-6">
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

        <div ref={resultsRef} id="results" className="scroll-mt-14">
          {phase.kind === "loading" ? (
            <div className="mx-auto max-w-3xl px-4">
              <ProgressPanel entries={phase.entries} waitingFor={null} />
              <Button variant="secondary" className="mb-10" onClick={cancel}>
                Cancel
              </Button>
            </div>
          ) : null}
          {phase.kind === "error" ? (
            <div role="alert" className="mx-auto mb-16 max-w-3xl animate-rise border-l-4 border-burgundy px-6 py-5">
              <p className="font-serif text-2xl text-ink italic">{phase.error.code === "rate_limited" ? "Please wait a moment" : "The analysis could not be completed"}</p>
              <p className="mt-2 leading-relaxed text-ink-soft">{phase.error.message}</p>
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

        <section id="method" aria-labelledby="method-title" className="mx-auto max-w-[1440px] scroll-mt-16 px-4 py-12 md:px-12">
          <h2 id="method-title" className="label mb-3 text-ink">
            Method
          </h2>
          <p className="max-w-3xl text-sm leading-relaxed text-ink-soft">
            Your description is read for its structure: the options, who is involved, what is at stake, how reversible it is and how much time you have. Approved historical
            decisions are rated by Jev on that structure, using only what was known before each decision; outcomes are read afterwards. Every historical statement links to an
            exact passage. ● observation = sourced fact · ◇ interpretation = a reading of it.
          </p>
        </section>
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

const REVERSIBILITY: Record<DecisionProfile["reversibility"], string | null> = {
  reversible: "Can be undone",
  partly_reversible: "Partly reversible",
  irreversible: "Hard to undo",
  unknown: null,
};
const URGENCY: Record<DecisionProfile["urgency"], string | null> = {
  immediate: "Has to be decided now",
  days: "A deadline in days",
  weeks: "A deadline in weeks",
  months: "Months to decide",
  years: "Years to decide",
  unknown: null,
};

/** "The shape of it": the decision profile as a few plain tags. */
function shapeOf(p: DecisionProfile | null): string[] {
  if (!p) return [];
  return [
    p.options.length ? `${p.options.length} options on the table` : null,
    p.stakes !== "unknown" ? `${p.stakes.charAt(0).toUpperCase()}${p.stakes.slice(1)} stakes` : null,
    REVERSIBILITY[p.reversibility],
    URGENCY[p.urgency],
    p.relationship === "repeated" ? "You'll keep working with these people" : p.relationship === "one_off" ? "A one-off relationship" : null,
  ].filter((t): t is string => Boolean(t));
}
