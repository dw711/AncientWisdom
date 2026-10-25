"use client";

import { useRef, useState, type ReactNode } from "react";
import type {
  AdviceResponse,
  AnalogyRating,
  CaseCard,
  Comparison,
  ConstraintKey,
  InsufficientEvidenceResponse,
  NeedsClarificationResponse,
  PartialResponse,
  ReadyResponse,
} from "@/lib/contracts/advice";
import { Mark } from "../site-header";
import { BulletList, Button, Label, Tag, cx } from "../ui";
import { AdviceDetail } from "./advice-detail";
import { CaseDetail, type OpenSources } from "./case-detail";
import { DecisionTimeline, type TimelineNode } from "./decision-timeline";

interface Props {
  response: AdviceResponse;
  changedLabel: string | null;
  busy: boolean;
  onOpenSources: OpenSources;
  onApplyChange: (key: ConstraintKey, value: string | number | boolean, label: string) => void;
  onEditContext: () => void;
  onEditQuestion: () => void;
  onClarify: (answers: { question: string; answer: string }[]) => void;
}

export function ResultsView(p: Props) {
  const r = p.response;
  const [selected, setSelected] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  if (r.status === "needs_clarification") return <ClarificationPanel response={r} onSubmit={p.onClarify} busy={p.busy} />;
  if (r.status === "insufficient_evidence") return <InsufficientPanel response={r} onEditContext={p.onEditContext} />;

  const partial = r.status === "partial" ? r : null;

  // Every case in the answer, in date order, followed by the person's own decision.
  type Entry = { card: CaseCard; role: "supporting" | "challenging" | "unrated"; comparison: Comparison | null; rating: AnalogyRating | null; note?: string };
  const entries: Entry[] = [
    ...r.comparisons.map((c) => ({ card: c.case, role: c.role, comparison: c, rating: c.rating })),
    ...(r.challenging ? [{ card: r.challenging.case, role: "challenging" as const, comparison: r.challenging, rating: r.challenging.rating }] : []),
    ...(partial?.rated_cases.map((c) => ({ card: c.case, role: c.role, comparison: null, rating: c.rating, note: "Rated by Jev. The written comparison is unavailable for this result." })) ?? []),
    ...(partial?.unranked_cases.map((card) => ({
      card,
      role: "unrated" as const,
      comparison: null,
      rating: null,
      note: partial.preview ? "Shares wording with your description. Not assessed for fit." : "Not rated: the analogy assessment was unavailable.",
    })) ?? []),
  ].sort((a, b) => (a.card.year_start ?? Infinity) - (b.card.year_start ?? Infinity));

  const nodes: TimelineNode[] = [
    ...entries.map((e) => ({ kind: "case" as const, key: e.card.case_id, card: e.card, role: e.role, lesson: e.comparison?.lesson || null, fit: e.rating?.analogy_fit ?? null })),
    { kind: "today" as const, key: "today" as const, hint: r.recommendation ? "Advice and next steps" : "What we found" },
  ];
  const chosen = entries.find((e) => e.card.case_id === selected);

  const showTimeline = () => {
    setSelected(null);
    root.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const showAdvice = () => {
    setSelected("today");
    requestAnimationFrame(() => root.current?.querySelector("[data-detail]")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div ref={root} className={cx("scroll-mt-4", selected ? "space-y-8" : "flex min-h-[60vh] flex-col justify-center space-y-8 pb-10")}>
      <StatusLine response={r} changedLabel={p.changedLabel} />
      <DecisionTimeline nodes={nodes} selected={selected} onSelect={setSelected} panelTone={selected === "today" ? "dark" : "light"}>
        {selected === "today" ? (
          <AdviceDetail response={r} busy={p.busy} onApplyChange={p.onApplyChange} onEditContext={p.onEditContext} onClose={() => setSelected(null)} />
        ) : chosen ? (
          <CaseDetail
            key={chosen.card.case_id}
            card={chosen.card}
            comparison={chosen.comparison}
            rating={chosen.rating}
            role={chosen.role}
            note={chosen.note}
            passages={r.passages}
            sources={r.sources}
            onOpen={p.onOpenSources}
            onClose={() => setSelected(null)}
          />
        ) : null}
      </DecisionTimeline>

      <nav aria-label="Results" className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl bg-night/95 p-1.5 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.5)] backdrop-blur">
          <span className="hidden sm:contents">
            <Mark size="lg" tone="glass" />
          </span>
          <ToolbarButton active={selected === null} onClick={showTimeline}>
            Timeline
          </ToolbarButton>
          <ToolbarButton active={false} onClick={p.onEditQuestion} disabled={p.busy}>
            Edit question
          </ToolbarButton>
          <button
            type="button"
            onClick={showAdvice}
            aria-pressed={selected === "today"}
            className={cx(
              "h-10 rounded-lg border px-4 text-[0.8125rem] font-medium transition-colors",
              selected === "today" ? "border-white bg-transparent text-white" : "border-transparent bg-white text-ink hover:bg-paper-deep",
            )}
          >
            {r.recommendation ? "Your advice" : "Summary"}
          </button>
        </div>
      </nav>
    </div>
  );
}

function ToolbarButton({ active, onClick, disabled, children }: { active: boolean; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cx(
        "h-10 rounded-lg border px-3.5 text-[0.8125rem] transition-colors disabled:opacity-50",
        active ? "border-white/80 text-white" : "border-white/10 bg-white/[0.06] text-white/70 enabled:hover:border-white/35 enabled:hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

/** One quiet line above the timeline, so the timeline stays the first thing seen. */
function StatusLine({ response: r, changedLabel }: { response: ReadyResponse | PartialResponse; changedLabel: string | null }) {
  const items: { text: string; tone: string }[] = [];
  if (changedLabel) items.push({ text: `Fresh analysis with your change: ${changedLabel}`, tone: "text-moss" });
  if (r.sample) items.push({ text: "Sample analysis prepared in advance; fit ratings are illustrative", tone: "text-ink-soft" });
  if (r.status === "partial") items.push({ text: r.preview ? "Preview mode: cases share wording with your description and are not assessed for fit" : "Partial result: see Your decision for what is missing", tone: "text-amber" });
  if (!items.length) return null;
  return (
    <p role="status" className="text-center text-sm font-light">
      {items.map((i, n) => (
        <span key={i.text} className={i.tone}>
          {n ? " · " : ""}
          {i.text}
        </span>
      ))}
    </p>
  );
}

function PanelHeading({ eyebrow, title, id }: { eyebrow: string; title: string; id: string }) {
  return (
    <>
      <p className="text-sm font-light text-ink-soft">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)] leading-[1.05] font-semibold tracking-[-0.04em] text-ink">
        {title}
      </h2>
    </>
  );
}

function ClarificationPanel({ response, onSubmit, busy }: { response: NeedsClarificationResponse; onSubmit: Props["onClarify"]; busy: boolean }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const ready = response.questions.every((q) => (answers[q.id] ?? "").trim().length > 0);
  return (
    <section aria-labelledby="sec-clarify" className="mx-auto max-w-3xl animate-rise rounded-2xl bg-card p-6 sm:p-10">
      <PanelHeading eyebrow="One thing first" title="We need one more detail" id="sec-clarify" />
      <p className="mt-4 leading-relaxed font-light text-ink-soft">
        {response.profile?.decision ? (
          <>
            We understood your decision as: <span className="font-medium text-ink">{response.profile.decision}</span>.{" "}
          </>
        ) : null}
        Before comparing it with historical cases, we need one more detail, because it would change what is worth recommending.
      </p>
      <form
        className="mt-8 space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onSubmit(response.questions.map((q) => ({ question: q.question, answer: answers[q.id].trim() })));
        }}
      >
        {response.questions.map((q) => (
          <label key={q.id} className="block">
            <span className="block text-lg font-medium tracking-[-0.015em] text-ink">{q.question}</span>
            <span className="mt-1 block text-sm font-light text-muted">{q.why_it_matters}</span>
            <textarea
              rows={2}
              maxLength={500}
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
              className="mt-3 block w-full rounded-xl border border-rule bg-paper px-4 py-3 text-ink focus:border-ink focus:outline-none"
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
    <section aria-labelledby="sec-nomatch" className="mx-auto max-w-3xl animate-rise rounded-2xl bg-card p-6 sm:p-10">
      <PanelHeading eyebrow="No comparison shown" title={response.reason === "evidence_removed" ? "Not enough verified evidence" : "No close historical match"} id="sec-nomatch" />
      <p className="mt-5 text-[1.2rem] leading-relaxed font-light text-ink">{response.message}</p>
      <p className="mt-3 leading-relaxed font-light text-ink-soft">Rather than force a comparison, we are showing nothing. A weak analogy can mislead more than it helps.</p>
      {response.near_misses.length ? (
        <div className="mt-8">
          <Label>Closest cases considered</Label>
          <ul>
            {response.near_misses.map((m) => (
              <li key={m.case_id} className="dots-b py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium text-ink">{m.title}</p>
                  {m.analogy_fit !== null ? <Tag>{m.analogy_fit}/100</Tag> : null}
                </div>
                <BulletList items={m.reasons} className="mt-2 text-sm font-light text-ink-soft" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-8">
        <Label>What might help</Label>
        <BulletList items={response.suggestions} className="font-light text-ink-soft" />
      </div>
      <Button variant="secondary" className="mt-8" onClick={onEditContext}>
        Edit your description
      </Button>
      <p className="mt-6 font-mono text-[0.68rem] text-muted">
        {response.request_id} · corpus {response.versions.corpus} · {response.versions.rubric}
        {response.versions.jev_model ? ` · ${response.versions.jev_model}` : ""}
      </p>
    </section>
  );
}
