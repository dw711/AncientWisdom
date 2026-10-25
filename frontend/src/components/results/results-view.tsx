"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { AdviceResponse, ConstraintKey, InsufficientEvidenceResponse, NeedsClarificationResponse, PartialResponse, ReadyResponse } from "@/lib/contracts/advice";
import { BulletList, Button, Label, SectionHeading, Tag } from "../ui";
import { AdviceDetail } from "./advice-detail";
import { CaseDetail, type OpenSources } from "./case-detail";
import { ForkStage, type StageApi } from "../fork/fork-stage";
import { ForkStack } from "../fork/fork-stack";
import { YearIndex } from "../fork/year-index";
import { collectEntries, toPaths, type Focus } from "../fork/model";
import { useMedia } from "../fork/use-media";

const WRAP = "mx-auto w-full max-w-[1440px] px-4 md:px-12";

interface Props {
  response: AdviceResponse;
  changedLabel: string | null;
  busy: boolean;
  onOpenSources: OpenSources;
  onApplyChange: (key: ConstraintKey, value: string | number | boolean, label: string) => void;
  onEditContext: () => void;
  onClarify: (answers: { question: string; answer: string }[]) => void;
}

export function ResultsView(p: Props) {
  const r = p.response;
  if (r.status === "needs_clarification") return <ClarificationPanel response={r} onSubmit={p.onClarify} busy={p.busy} />;
  if (r.status === "insufficient_evidence") return <InsufficientPanel response={r} onEditContext={p.onEditContext} />;
  return <ForkResults {...p} response={r} />;
}

/**
 * Ready and partial results as a fork: one branch per historical case, drawn
 * on scroll, then each case in full, then your decision in the ink section.
 */
function ForkResults(p: Props & { response: ReadyResponse | PartialResponse }) {
  const r = p.response;
  const wide = useMedia("(min-width: 1024px) and (min-height: 620px)");
  const paths = useMemo(() => toPaths(collectEntries(r), r.claims), [r]);
  const [hover, setHover] = useState<Focus | null>(null);
  const [handleT, setHandleT] = useState(0);
  const [handleTouched, setHandleTouched] = useState(false);
  const [revealed, setRevealed] = useState<number[]>([]);
  const stage = useRef<StageApi | null>(null);

  const focus: Focus | null = hover ?? (handleTouched ? { source: "handle", t: handleT } : null);
  const onHandle = useCallback((t: number) => {
    setHandleTouched(true);
    setHandleT(t);
  }, []);
  const showDetails = (id: string) => document.getElementById(`path-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const showToday = () => document.getElementById("your-decision")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div>
      <div className={WRAP}>
        <StatusLine response={r} changedLabel={p.changedLabel} />
      </div>
      {paths.length ? (
        <>
          <YearIndex
            paths={paths}
            revealed={wide ? revealed : paths.map((x) => x.stops.length)}
            focus={focus}
            onHover={setHover}
            onJump={(id) => (wide && stage.current ? stage.current.scrollTo(id) : showDetails(id))}
            onToday={showToday}
          />
          {wide ? (
            <div className={WRAP}>
            <ForkStage
              key={r.request_id}
              paths={paths}
              focus={focus}
              handleT={handleT}
              onHover={setHover}
              onHandle={onHandle}
              onReveal={setRevealed}
              onOpenSources={p.onOpenSources}
              onShowDetails={showDetails}
              apiRef={stage}
            />
            </div>
          ) : (
            <div className={`${WRAP} pt-8`}>
              <ForkStack paths={paths} focus={focus} handleT={handleT} onHover={setHover} onHandle={onHandle} onOpenSources={p.onOpenSources} onShowDetails={showDetails} />
            </div>
          )}

          <section aria-labelledby="paths-title" className={`${WRAP} pt-16 pb-20`}>
            <SectionHeading id="paths-title" numeral="II" title="Each path, in full" aside={`${paths.length} ${paths.length === 1 ? "case" : "cases"} from the record`} />
            <div className="space-y-8">
              {paths.map((x) => (
                <div key={x.id} id={`path-${x.id}`} className="scroll-mt-28">
                  <CaseDetail
                    card={x.card}
                    comparison={x.comparison}
                    rating={x.rating}
                    role={x.role}
                    note={x.note}
                    color={x.color}
                    passages={r.passages}
                    sources={r.sources}
                    onOpen={p.onOpenSources}
                  />
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <Ending response={r} paths={paths} busy={p.busy} onApplyChange={p.onApplyChange} onEditContext={p.onEditContext} />
    </div>
  );
}

/** The ink ending: which path is closest to yours, then the advice. */
function Ending({
  response: r,
  paths,
  busy,
  onApplyChange,
  onEditContext,
}: {
  response: ReadyResponse | PartialResponse;
  paths: ReturnType<typeof toPaths>;
  busy: boolean;
  onApplyChange: Props["onApplyChange"];
  onEditContext: () => void;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const options = [
    ...paths.map((x) => ({ id: x.id, label: `${x.short}’s`, color: x.color, reflection: x.lesson ?? x.card.decision_question })),
    { id: "none", label: "None of them", color: "#F2EDE4", reflection: "Then weigh these comparisons lightly. Add context so the next search can look for a closer case." },
  ];
  const picked = options.find((o) => o.id === choice);
  const question = "Whose path is closest to yours?".split(" ");

  return (
    <section id="your-decision" aria-labelledby="ending-title" className="scroll-mt-12 bg-ink text-paper">
      <div className="mx-auto max-w-[1440px] px-4 py-20 md:px-12 md:py-28">
        {paths.length ? (
          <>
            <p className="label mb-8 text-paper/60">Today · Your decision</p>
            <h2 id="ending-title" className="max-w-[16ch] font-serif text-[44px] leading-[1.05] italic md:text-[76px]">
              {question.join(" ")}
            </h2>
            <div role="group" aria-label="Choose the closest path" className="mt-10 flex flex-wrap gap-3">
              {options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={choice === o.id}
                  onClick={() => setChoice(o.id)}
                  className="label flex items-center gap-2 rounded-full border border-paper/70 px-6 py-3 transition-colors hover:bg-paper hover:text-ink aria-pressed:bg-paper aria-pressed:text-ink"
                >
                  <span aria-hidden="true" className="size-2 rounded-full" style={{ background: o.color }} />
                  {o.label}
                </button>
              ))}
            </div>
            <p aria-live="polite" className="mt-8 min-h-[3.2em] max-w-[60ch] text-[18px] leading-relaxed text-paper/85">
              {picked ? (
                <span key={picked.id} className="inline-block animate-rise">
                  {picked.reflection}
                </span>
              ) : null}
            </p>
          </>
        ) : (
          <h2 id="ending-title" className="font-serif text-[40px] italic">
            Your decision
          </h2>
        )}

        <div className="mt-12 border-t border-paper/20 pt-12">
          <AdviceDetail response={r} busy={busy} onApplyChange={onApplyChange} onEditContext={onEditContext} />
        </div>

        {r.sources.length ? (
          <p className="mt-14 border-t border-paper/15 pt-5 font-mono text-[11px] leading-relaxed text-paper/55">
            <span className="label mr-2">Sources</span>
            {r.sources.map((s, i) => (
              <span key={s.source_id}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline decoration-paper/30 underline-offset-2 hover:text-paper">
                  {s.title}
                </a>
                {i < r.sources.length - 1 ? " · " : ""}
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** One quiet mono line above the fork. */
function StatusLine({ response: r, changedLabel }: { response: ReadyResponse | PartialResponse; changedLabel: string | null }) {
  const items: { text: string; tone: string }[] = [];
  if (changedLabel) items.push({ text: `Fresh analysis with your change: ${changedLabel}`, tone: "text-moss" });
  if (r.sample) items.push({ text: "Sample analysis prepared in advance; fit ratings are illustrative", tone: "text-bronze" });
  if (r.status === "partial") items.push({ text: r.preview ? "Preview mode: cases share wording with your description and are not assessed for fit" : "Partial result: see Your decision for what is missing", tone: "text-amber" });
  if (!items.length) return null;
  return (
    <p role="status" className="label pb-4">
      {items.map((i, n) => (
        <span key={i.text} className={i.tone}>
          {n ? " · " : ""}
          {i.text}
        </span>
      ))}
    </p>
  );
}

function ClarificationPanel({ response, onSubmit, busy }: { response: NeedsClarificationResponse; onSubmit: Props["onClarify"]; busy: boolean }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const ready = response.questions.every((q) => (answers[q.id] ?? "").trim().length > 0);
  return (
    <section aria-labelledby="sec-clarify" className="mx-auto max-w-3xl px-4 animate-rise space-y-6 py-10">
      <SectionHeading id="sec-clarify" numeral="I" title="One thing first" />
      <p className="leading-relaxed text-ink-soft">
        {response.profile?.decision ? (
          <>
            We understood your decision as: <span className="font-serif text-ink italic">{response.profile.decision}</span>.{" "}
          </>
        ) : null}
        Before walking any historical path, we need one more detail, because it would change what is worth recommending.
      </p>
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onSubmit(response.questions.map((q) => ({ question: q.question, answer: answers[q.id].trim() })));
        }}
      >
        {response.questions.map((q) => (
          <label key={q.id} className="block">
            <span className="block font-serif text-[22px] text-ink italic">{q.question}</span>
            <span className="mt-1 block text-sm text-muted">{q.why_it_matters}</span>
            <textarea
              rows={2}
              maxLength={500}
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
              className="mt-3 block w-full border border-ink/40 bg-transparent px-3 py-2.5 text-ink focus:border-ink focus:outline-none"
            />
          </label>
        ))}
        <Button type="submit" disabled={!ready || busy}>
          Continue with this answer
        </Button>
      </form>
    </section>
  );
}

function InsufficientPanel({ response, onEditContext }: { response: InsufficientEvidenceResponse; onEditContext: () => void }) {
  return (
    <section aria-labelledby="sec-nomatch" className="mx-auto max-w-3xl px-4 animate-rise space-y-6 py-10">
      <SectionHeading id="sec-nomatch" numeral="—" title={response.reason === "evidence_removed" ? "Not enough verified evidence" : "No path to draw"} />
      <svg viewBox="0 0 400 40" className="h-10 w-full max-w-md" aria-hidden="true">
        <path d="M0 20 H180" stroke="#14120F" strokeWidth="1.5" />
        <circle cx="190" cy="20" r="8" fill="none" stroke="#14120F" strokeWidth="1.5" />
        <path d="M198 20 H400" stroke="#14120F" strokeWidth="1.5" strokeDasharray="3 6" opacity=".4" />
      </svg>
      <p className="font-serif text-[1.4rem] leading-relaxed text-ink italic">{response.message}</p>
      <p className="leading-relaxed text-ink-soft">Rather than force a comparison, we are showing nothing. A weak analogy can mislead more than it helps.</p>
      {response.near_misses.length ? (
        <div>
          <Label>Closest cases considered</Label>
          <ul className="space-y-3">
            {response.near_misses.map((m) => (
              <li key={m.case_id} className="border border-ink/15 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-serif text-lg text-ink">{m.title}</p>
                  {m.analogy_fit !== null ? <Tag>{m.analogy_fit}/100</Tag> : null}
                </div>
                <BulletList items={m.reasons} className="mt-1.5 text-sm text-ink-soft" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <Label>What might help</Label>
        <BulletList items={response.suggestions} className="text-ink-soft" />
      </div>
      <Button variant="secondary" onClick={onEditContext}>
        Edit your description
      </Button>
      <p className="font-mono text-[0.68rem] text-muted">
        {response.request_id} · corpus {response.versions.corpus} · {response.versions.rubric}
        {response.versions.jev_model ? ` · ${response.versions.jev_model}` : ""}
      </p>
    </section>
  );
}
