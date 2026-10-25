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
import { Collage } from "./precedent/collage";
import { FloatingNav, type NavSection } from "./precedent/floating-nav";
import { collectEntries, toEditions } from "./precedent/model";

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
  const printed = response && (response.status === "ready" || response.status === "partial") ? response : null;
  const editions = printed ? toEditions(collectEntries(printed)) : [];
  const sections: NavSection[] = printed
    ? [
        { id: "letter", label: "Letter" },
        { id: "front", label: "Front page" },
        ...editions.map((e) => ({ id: `edition-${e.letter.toLowerCase()}`, label: `Edition ${e.letter}` })),
        ...(printed.recommendation || printed.alternatives.length ? [{ id: "paths", label: "Paths" }] : []),
        { id: "editorial", label: "Next steps" },
      ]
    : [{ id: "letter", label: "Letter" }];

  return (
    <div className="flex min-h-full flex-col pt-12">
      <FloatingNav sections={sections} />
      <SiteHeader size="full">
        {health ? (
          <span title={health.mode === "live" ? "Live analysis with Jev and a language model" : "Preview: prewritten sample analyses for the example dilemmas"} className={health.mode === "live" ? "text-moss" : "text-burgundy"}>
            {health.mode === "live" ? "● Live" : "Preview"}
          </span>
        ) : null}
      </SiteHeader>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-16 md:px-10">
        <section id="letter" aria-labelledby="letter-h" className="grid scroll-mt-20 gap-10 border-b border-ink py-12 lg:grid-cols-12 lg:gap-8">
          <div ref={formRef} className="min-w-0 scroll-mt-20 lg:col-span-8">
            <h1 id="letter-h" className="label mb-5 text-burgundy">
              Reader’s letter
            </h1>
            {compact ? (
              <>
                <blockquote className="font-display text-[24px] leading-[1.25] italic md:text-[30px]">
                  <p className="line-clamp-4">
                    <span aria-hidden="true" className="text-burgundy">
                      “
                    </span>
                    {query.trim()}
                    <span aria-hidden="true" className="text-burgundy">
                      ”
                    </span>
                  </p>
                  <footer className="label mt-5 text-muted not-italic">— Undecided, by letter</footer>
                </blockquote>
                <Button variant="secondary" className="mt-8" disabled={busy} onClick={() => setEditing(true)}>
                  Edit your letter
                </Button>
              </>
            ) : (
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
            )}
          </div>
          <aside className="lg:col-span-4 lg:border-l lg:border-ink lg:pl-8">
            <p className="label mb-2 text-muted">Editor’s note</p>
            <p className="max-w-[34ch] text-[16px] leading-snug italic">Matched on decision structure, incentives, constraints and timing, not on topic.</p>
            {shape.length ? (
              <ul className="label mt-4 flex flex-wrap gap-1.5">
                {shape.map((t) => (
                  <li key={t} className="border border-ink/50 px-2 py-1">
                    {t}
                  </li>
                ))}
              </ul>
            ) : null}
            {compact ? (
              <Collage editions={editions} />
            ) : (
              <p className="mt-6 text-[15px] leading-relaxed text-ink-soft">
                Write to us about a choice you are facing. We find sourced decisions from the past with a similar structure and print one edition for each: what happened,
                where it resembles yours and where it differs. Then the editorial says what we would do, and what would change our view.
              </p>
            )}
            {/* Stays beside the results too: that is when it matters most. */}
            <p className="mt-6 border-l-2 border-burgundy pl-3 text-sm leading-relaxed text-muted">
              Historical comparisons have limits. Circumstances differ, sources disagree, and a past outcome does not predict yours. Treat the advice as one input to your
              own judgement.
            </p>
          </aside>
        </section>

        <div ref={resultsRef} id="results" className="scroll-mt-16">
          {phase.kind === "loading" ? (
            <div className="py-6">
              <ProgressPanel entries={phase.entries} waitingFor={null} />
              <Button variant="secondary" className="mt-6" onClick={cancel}>
                Stop the press
              </Button>
            </div>
          ) : null}
          {phase.kind === "error" ? (
            <div role="alert" className="mx-auto my-10 max-w-3xl animate-rise border-2 border-burgundy px-6 py-5">
              <p className="label text-burgundy">Correction</p>
              <p className="mt-1 font-display text-2xl font-black text-ink">{phase.error.code === "rate_limited" ? "Please wait a moment" : "This edition could not be printed"}</p>
              <p className="mt-2 leading-relaxed text-ink-soft">{phase.error.message}</p>
              {phase.error.details?.length ? (
                <ul className="mt-2 list-disc pl-5 text-sm text-ink-soft">
                  {phase.error.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-2 text-sm text-muted">Your letter and context are unchanged. No advice was produced.</p>
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
