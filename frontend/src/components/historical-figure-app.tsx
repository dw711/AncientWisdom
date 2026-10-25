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
import { Button, CJK_FONT, Tag, cx } from "./ui";

type Phase =
  | { kind: "idle" }
  | { kind: "loading"; entries: ProgressEntry[] }
  | { kind: "result"; response: AdviceResponse }
  | { kind: "error"; httpStatus: number; error: ApiError["error"]; requestId: string | null };

const CJK = /[㐀-鿿]/;

const STEPS = [
  {
    title: "Describe your decision",
    text: "Say what the options are, who is involved and what makes it hard. Add a deadline, or whether the choice can be undone, if you know.",
    row: ["Saved", "Nothing. Used for this answer only"],
  },
  {
    title: "Find comparisons",
    text: "Jev rates sourced historical decisions on how closely they resemble yours, before reading how they turned out. Weak matches are left out rather than forced.",
    row: ["Rated on", "Structure, incentives, constraints, timing"],
  },
  {
    title: "Get conditional advice",
    text: "See what each case shares with yours, where it differs, what to do next, and what would change that advice.",
    row: ["Checked", "Every quotation against its source"],
  },
] as const;

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
  const formRef = useRef<HTMLElement>(null);
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

  const editQuestion = (withContext = false) => {
    setEditing(true);
    if (withContext) setContextOpen(true);
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
  const showHero = phase.kind === "idle";

  return (
    <div className="flex min-h-full flex-col">
      <div className={cx(showHero && "bg-band")}>
        <SiteHeader>
          {health ? (
            <span
              className="inline-flex items-center gap-2 rounded-lg border border-ink/15 px-3 py-1.5 text-[0.8125rem] text-ink"
              title={health.mode === "live" ? "Live analysis with Jev and a language model" : "Preview: prewritten sample analyses for the example dilemmas"}
            >
              <span aria-hidden="true" className={cx("size-1.5 rounded-full", health.mode === "live" ? "bg-moss" : "bg-amber")} />
              {health.mode === "live" ? "Live" : "Preview mode"}
            </span>
          ) : null}
        </SiteHeader>

        {showHero ? (
          <section className="mx-auto max-w-[90rem] px-4 pt-6 pb-36 text-center sm:px-10 sm:pt-10 sm:pb-44">
            <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm font-light text-ink-soft">
              <span>Decision support</span>
              <Tag>
                <span style={CJK_FONT} lang="zh-Hans" className="tracking-[0.15em]">
                  以古为鉴
                </span>
              </Tag>
              <span>{health?.corpus ? `${health.corpus.approved_cases} sourced cases` : "Sourced history"}</span>
            </p>
            <h1 className="mt-6 text-[clamp(3rem,8.2vw,7.75rem)] leading-[0.9] font-semibold tracking-[-0.05em] text-ink uppercase">Historical Figure</h1>
            <p className="mx-auto mt-6 max-w-xl text-[clamp(1.15rem,1.8vw,1.4rem)] leading-snug font-light text-ink">What can history teach your next decision?</p>
          </section>
        ) : null}
      </div>

      <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 pb-32 sm:px-10">
        {compact ? (
          <section aria-label="Your question" className="mx-auto mt-2 flex max-w-4xl items-center gap-3 rounded-xl bg-paper-deep py-2 pr-2 pl-5">
            <div className="min-w-0 flex-1 py-1">
              <p className="text-xs text-muted">Your question</p>
              <p className="truncate text-[0.95rem] text-ink">{query}</p>
            </div>
            <Button className="shrink-0" disabled={busy} onClick={() => editQuestion()}>
              <span>
                Edit<span className="hidden sm:inline"> question</span>
              </span>
            </Button>
          </section>
        ) : (
          <section
            ref={formRef}
            aria-labelledby="form-title"
            className={cx(
              "relative scroll-mt-4 rounded-[1.25rem] bg-night px-5 py-8 text-white [color-scheme:dark] sm:px-10 sm:py-12 lg:px-14 lg:py-14",
              showHero ? "-mt-28 sm:-mt-32" : "mt-4",
            )}
          >
            <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-16">
              <div>
                <p className="text-sm font-light text-white/55">{showHero ? "Start here" : "Edit your question"}</p>
                <h2 id="form-title" className="mt-3 text-[clamp(2rem,3.4vw,3rem)] leading-[1] font-semibold tracking-[-0.04em]">
                  What are you deciding?
                </h2>
                <p className="mt-5 text-[0.95rem] leading-relaxed font-light text-white/65">
                  Historical Figure finds sourced decisions from the past with a similar structure, shows what they share with yours and where they differ, and suggests what to
                  do next, along with what would change that advice.
                </p>
              </div>
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

        {showHero ? (
          <section aria-labelledby="how" className="pt-24 sm:pt-36">
            <p className="text-center text-sm font-light text-ink-soft">Three steps</p>
            <h2 id="how" className="mt-4 text-center text-[clamp(2.6rem,7.4vw,7rem)] leading-[0.9] font-semibold tracking-[-0.05em] uppercase">
              How it works
            </h2>
            <p className="mx-auto mt-6 max-w-lg text-center text-[1.1rem] leading-snug font-light text-ink">
              Every comparison is built from sourced records, rated before outcomes are read, and checked before you see it.
            </p>
            <ol className="mt-14 grid gap-5 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex flex-col overflow-hidden rounded-2xl bg-card">
                  <div className="p-7 sm:p-8">
                    <p className="text-[2.75rem] leading-none font-semibold tracking-[-0.05em] tabular-nums">{String(i + 1).padStart(2, "0")}</p>
                    <h3 className="mt-10 text-[1.45rem] leading-tight font-semibold tracking-[-0.03em]">{s.title}</h3>
                    <p className="mt-3 leading-relaxed font-light text-ink-soft">{s.text}</p>
                  </div>
                  <dl className="mt-auto grid grid-cols-[6rem_1fr] gap-3 border-t border-rule-soft px-7 py-4 text-sm sm:px-8">
                    <dt className="font-semibold">{s.row[0]}</dt>
                    <dd className="font-light text-ink-soft">{s.row[1]}</dd>
                  </dl>
                </li>
              ))}
            </ol>
            <p className="mx-auto mt-14 max-w-2xl text-center leading-relaxed font-light text-ink-soft">
              Historical comparisons have limits. Circumstances differ, sources disagree, and a past outcome does not predict yours. Treat the advice as one input to your own
              judgement.
            </p>
          </section>
        ) : null}

        <div ref={resultsRef} id="results" className="scroll-mt-4 pt-10">
          {phase.kind === "loading" ? <ProgressPanel entries={phase.entries} waitingFor={null} /> : null}
          {phase.kind === "error" ? (
            <div role="alert" className="mx-auto max-w-2xl animate-rise rounded-2xl bg-card p-7 sm:p-10">
              <p className="text-sm font-light text-accent-ink">{phase.error.code === "rate_limited" ? "Too many requests" : "Something went wrong"}</p>
              <p className="mt-2 text-[clamp(1.6rem,3vw,2.2rem)] leading-tight font-semibold tracking-[-0.035em] text-ink">
                {phase.error.code === "rate_limited" ? "Please wait a moment" : "The analysis could not be completed"}
              </p>
              <p className="mt-3 leading-relaxed font-light text-ink-soft">{phase.error.message}</p>
              {phase.error.details?.length ? (
                <ul className="mt-2 list-disc pl-5 text-sm font-light text-ink-soft">
                  {phase.error.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-3 text-sm text-muted">Your description and context are unchanged. No advice was produced.</p>
              <div className="mt-6 flex flex-wrap items-center gap-4">
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
                onEditContext={() => editQuestion(true)}
                onEditQuestion={() => editQuestion()}
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
