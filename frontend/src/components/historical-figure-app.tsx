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
import { Reveal } from "./reveal";
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
              className="inline-flex items-center gap-2 rounded-full border border-rule px-3 py-1.5 text-[0.75rem] font-semibold tracking-[0.04em] text-ink"
              title={health.mode === "live" ? "Live analysis with Jev and a language model" : "Preview: prewritten sample analyses for the example dilemmas"}
            >
              <span aria-hidden="true" className={cx("size-1.5 animate-breathe rounded-full", health.mode === "live" ? "bg-moss" : "bg-amber")} />
              {health.mode === "live" ? "Live" : "Preview mode"}
            </span>
          ) : null}
        </SiteHeader>

        {showHero ? (
          <section className="relative mx-auto max-w-[90rem] overflow-hidden px-4 pt-12 pb-40 sm:px-10 sm:pt-20 sm:pb-52">
            <span
              aria-hidden="true"
              className="stamp seal pointer-events-none absolute top-16 right-10 hidden aspect-[242/465] h-[clamp(9rem,13vw,13rem)] [--d:520] [--r:-4deg] lg:block"
            />
            <p className="eyebrow relative flex stagger flex-wrap items-center gap-x-4 gap-y-2 text-ink-soft">
              <span>Decision support</span>
              <Tag>
                <span style={CJK_FONT} lang="zh-Hans" className="tracking-[0.15em]">
                  以古为鉴
                </span>
              </Tag>
              <span className="flex items-center gap-4">
                <span aria-hidden="true" className="h-px w-8 bg-accent" />
                {health?.corpus ? `${health.corpus.approved_cases} sourced cases` : "Sourced history"}
              </span>
            </p>
            <div className="relative mt-8 grid gap-8 lg:grid-cols-12 lg:items-end">
              <h1 className="display stagger text-[clamp(3.6rem,11vw,10rem)] leading-[0.86] tracking-[-0.045em] text-ink [--d:120] lg:col-span-9">
                Historical <em className="text-accent-ink">Figure</em>
              </h1>
              <p className="max-w-sm stagger border-l border-accent pl-5 text-[clamp(1.15rem,1.6vw,1.35rem)] leading-snug text-ink-soft [--d:260] lg:col-span-3 lg:mb-4">
                What can history teach your next decision?
              </p>
            </div>
          </section>
        ) : null}
      </div>

      <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 pb-32 sm:px-10">
        {compact ? (
          <section aria-label="Your question" className="mx-auto mt-6 flex max-w-4xl animate-rise items-center gap-4 rounded-[4px] border border-rule bg-card py-2 pr-2 pl-5">
            <div className="min-w-0 flex-1 py-1">
              <p className="eyebrow text-accent-ink">Your question</p>
              <p className="display mt-1 truncate text-[1.05rem] text-ink italic">{query}</p>
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
              "relative scroll-mt-4 overflow-hidden rounded-[6px] bg-night px-5 py-10 text-white shadow-[0_50px_120px_-60px_rgb(20_14_6/0.7)] ring-1 ring-white/[0.06] [color-scheme:dark] sm:px-10 sm:py-14 lg:px-16 lg:py-16",
              showHero ? "-mt-28 animate-rise [animation-delay:320ms] sm:-mt-36" : "mt-6 animate-rise",
            )}
          >
            <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
              <div className="lg:col-span-5">
                <p className="eyebrow flex items-center gap-3 text-accent">
                  <span aria-hidden="true" className="h-px w-8 bg-accent" />
                  {showHero ? "Start here" : "Edit your question"}
                </p>
                <h2 id="form-title" className="display mt-5 text-[clamp(2.4rem,4.4vw,4rem)] leading-[0.98]">
                  What are you deciding?
                </h2>
                <p className="mt-6 max-w-md text-[1rem] leading-relaxed text-white/65">
                  Historical Figure finds sourced decisions from the past with a similar structure, shows what they share with yours and where they differ, and suggests what to
                  do next, along with what would change that advice.
                </p>
              </div>
              <div className="lg:col-span-7">
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
            </div>
          </section>
        )}

        {showHero ? (
          <section aria-labelledby="how" className="grid gap-12 pt-28 sm:pt-44 lg:grid-cols-12 lg:gap-16">
            <Reveal className="lg:col-span-5">
              <div className="lg:sticky lg:top-12">
                <p className="eyebrow flex items-center gap-3 text-accent-ink">
                  <span aria-hidden="true" className="h-px w-8 bg-accent" />
                  Three steps
                </p>
                <h2 id="how" className="display mt-6 text-[clamp(3rem,7vw,6.5rem)] leading-[0.9] tracking-[-0.04em]">
                  How it works
                </h2>
                <p className="mt-8 max-w-md text-[1.15rem] leading-relaxed text-ink-soft">
                  Every comparison is built from sourced records, rated before outcomes are read, and checked before you see it.
                </p>
              </div>
            </Reveal>
            <ol className="border-t border-rule lg:col-span-7">
              {STEPS.map((s, i) => (
                <Reveal as="li" key={s.title} delay={i * 90} className={cx("group grid gap-x-8 gap-y-4 border-b border-rule py-10 sm:grid-cols-[6rem_1fr] sm:py-12", i === 1 && "lg:pl-12", i === 2 && "lg:pl-24")}>
                  <p className="display text-[clamp(3.5rem,6vw,5rem)] leading-[0.8] text-accent-ink italic tabular-nums transition-transform duration-500 ease-out-soft group-hover:-translate-y-1">
                    {String(i + 1).padStart(2, "0")}
                  </p>
                  <div>
                    <h3 className="display text-[clamp(1.6rem,2.4vw,2.1rem)] leading-tight">{s.title}</h3>
                    <p className="mt-3 max-w-xl leading-relaxed text-ink-soft">{s.text}</p>
                    <dl className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                      <dt className="eyebrow text-muted">{s.row[0]}</dt>
                      <dd className="text-ink">{s.row[1]}</dd>
                    </dl>
                  </div>
                </Reveal>
              ))}
            </ol>
            <Reveal as="p" className="max-w-2xl text-[0.95rem] leading-relaxed text-muted italic lg:col-span-7 lg:col-start-6">
              Historical comparisons have limits. Circumstances differ, sources disagree, and a past outcome does not predict yours. Treat the advice as one input to your own
              judgement.
            </Reveal>
          </section>
        ) : null}

        <div ref={resultsRef} id="results" className="scroll-mt-4 pt-10">
          {phase.kind === "loading" ? <ProgressPanel entries={phase.entries} waitingFor={null} /> : null}
          {phase.kind === "error" ? (
            <div role="alert" className="mx-auto max-w-2xl animate-rise rounded-[6px] border border-rule-soft border-t-2 border-t-danger bg-card p-7 sm:p-12">
              <p className="eyebrow text-danger">{phase.error.code === "rate_limited" ? "Too many requests" : "Something went wrong"}</p>
              <p className="display mt-4 text-[clamp(2rem,3.6vw,2.8rem)] leading-[1.05] text-ink">
                {phase.error.code === "rate_limited" ? "Please wait a moment" : "The analysis could not be completed"}
              </p>
              <p className="mt-4 leading-relaxed text-ink-soft">{phase.error.message}</p>
              {phase.error.details?.length ? (
                <ul className="mt-2 list-disc pl-5 text-sm text-ink-soft marker:text-accent">
                  {phase.error.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-3 text-sm text-muted">Your description and context are unchanged. No advice was produced.</p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Button onClick={() => void run()}>Try again</Button>
                {phase.requestId ? <span className="font-mono text-[0.68rem] text-muted">{phase.requestId}</span> : null}
              </div>
            </div>
          ) : null}
          {response ? (
            <div className={cx("transition-opacity duration-500", busy && "opacity-40")}>
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
