"use client";

import { useState } from "react";
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
import { BulletList, Button, Label, SectionHeading, Tag } from "../ui";
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
  onClarify: (answers: { question: string; answer: string }[]) => void;
}

export function ResultsView(p: Props) {
  const r = p.response;
  const [selected, setSelected] = useState<string | null>(null);

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

  return (
    <div className={selected ? "space-y-6" : "flex min-h-[58vh] flex-col justify-center space-y-6 pb-10"}>
      <StatusLine response={r} changedLabel={p.changedLabel} />
      <DecisionTimeline nodes={nodes} selected={selected} onSelect={setSelected}>
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
    </div>
  );
}

/** One quiet line above the timeline, so the timeline stays the first thing seen. */
function StatusLine({ response: r, changedLabel }: { response: ReadyResponse | PartialResponse; changedLabel: string | null }) {
  const items: { text: string; tone: string }[] = [];
  if (changedLabel) items.push({ text: `Fresh analysis with your change: ${changedLabel}`, tone: "text-moss" });
  if (r.sample) items.push({ text: "Sample analysis prepared in advance; fit ratings are illustrative", tone: "text-bronze" });
  if (r.status === "partial") items.push({ text: r.preview ? "Preview mode: cases share wording with your description and are not assessed for fit" : "Partial result: see Your decision for what is missing", tone: "text-amber" });
  if (!items.length) return null;
  return (
    <p role="status" className="text-center text-xs font-medium tracking-wide">
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
    <section aria-labelledby="sec-clarify" className="animate-rise space-y-6">
      <SectionHeading id="sec-clarify" numeral="I" title="One thing first" />
      <p className="leading-relaxed text-ink-soft">
        {response.profile?.decision ? (
          <>
            We understood your decision as: <span className="font-serif text-ink">{response.profile.decision}</span>.{" "}
          </>
        ) : null}
        Before comparing it with historical cases, we need one more detail, because it would change what is worth recommending.
      </p>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onSubmit(response.questions.map((q) => ({ question: q.question, answer: answers[q.id].trim() })));
        }}
      >
        {response.questions.map((q) => (
          <label key={q.id} className="block">
            <span className="block font-serif text-lg text-ink">{q.question}</span>
            <span className="mt-1 block text-sm text-muted">{q.why_it_matters}</span>
            <textarea
              rows={2}
              maxLength={500}
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
              className="mt-2 block w-full rounded-md border border-rule bg-card px-3 py-2.5 text-ink focus:border-burgundy/60 focus:outline-none"
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
    <section aria-labelledby="sec-nomatch" className="animate-rise space-y-6">
      <SectionHeading id="sec-nomatch" numeral="—" title={response.reason === "evidence_removed" ? "Not enough verified evidence" : "No close historical match"} />
      <p className="font-serif text-[1.25rem] leading-relaxed text-ink">{response.message}</p>
      <p className="leading-relaxed text-ink-soft">Rather than force a comparison, we are showing nothing. A weak analogy can mislead more than it helps.</p>
      {response.near_misses.length ? (
        <div>
          <Label>Closest cases considered</Label>
          <ul className="space-y-3">
            {response.near_misses.map((m) => (
              <li key={m.case_id} className="rounded-md border border-rule-soft bg-card px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium text-ink">{m.title}</p>
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
