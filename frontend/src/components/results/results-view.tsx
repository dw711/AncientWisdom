"use client";

import { useMemo, useState } from "react";
import type { AdviceResponse, ConstraintKey, InsufficientEvidenceResponse, NeedsClarificationResponse, PartialResponse, ReadyResponse } from "@/lib/contracts/advice";
import { BulletList, Button, Label, SectionHeading, Tag } from "../ui";
import { AdviceDetail } from "./advice-detail";
import { EditionColumn, type OpenSources } from "./edition-column";
import { LeadStory } from "./lead-story";
import { PathsLedger } from "./paths-ledger";
import { collectEntries, toEditions } from "../precedent/model";

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
  return <FrontPage {...p} response={r} />;
}

const GRID: Record<number, string> = {
  1: "mx-auto max-w-3xl",
  2: "md:grid-cols-2 md:[&>*:nth-child(odd)]:border-l-0",
  3: "lg:grid-cols-3 lg:[&>*:first-child]:border-l-0",
  4: "md:grid-cols-2 md:[&>*:nth-child(odd)]:border-l-0",
};

/** Ready and partial results: the lead story, one edition column per case, the paths, the editorial, then the sources. */
function FrontPage(p: Props & { response: ReadyResponse | PartialResponse }) {
  const r = p.response;
  const editions = useMemo(() => toEditions(collectEntries(r)), [r]);
  const n = Math.min(editions.length, 4);

  return (
    <div>
      <StatusLine response={r} changedLabel={p.changedLabel} />
      <LeadStory response={r} editions={editions} />

      {editions.length ? (
        <div className={`grid gap-y-14 py-10 ${GRID[n] ?? GRID[3]}`}>
          {editions.map((e, i) => (
            <div key={e.id} className={n > 1 ? "min-w-0 md:border-l md:border-ink md:px-8" : "min-w-0"}>
              <EditionColumn edition={e} claims={r.claims} passages={r.passages} sources={r.sources} onOpen={p.onOpenSources} delay={(i % 3) * 0.25} />
            </div>
          ))}
        </div>
      ) : null}

      <PathsLedger response={r} editions={editions} />

      <section id="editorial" aria-labelledby="editorial-h" className="scroll-mt-20 border-t-[6px] border-ink py-12">
        <SectionHeading id="editorial-h" numeral="The editorial" title="What to do next" bare />
        <AdviceDetail response={r} busy={p.busy} onApplyChange={p.onApplyChange} onEditContext={p.onEditContext} />
      </section>

      {r.sources.length ? (
        <footer aria-labelledby="sources-h" className="border-t border-ink pt-4 pb-6">
          <h2 id="sources-h" className="label mb-3 text-ink">
            Sources
          </h2>
          <ol className="list-inside list-decimal gap-8 font-mono text-[12px] leading-relaxed text-ink/75 marker:text-muted md:columns-2 lg:columns-3">
            {r.sources.map((s) => (
              <li key={s.source_id} className="mb-1.5 break-inside-avoid">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="break-words underline decoration-ink/25 underline-offset-2 hover:decoration-ink">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </footer>
      ) : null}
    </div>
  );
}

function StatusLine({ response: r, changedLabel }: { response: ReadyResponse | PartialResponse; changedLabel: string | null }) {
  const items: { text: string; tone: string }[] = [];
  if (changedLabel) items.push({ text: `Reprinted with your change: ${changedLabel}`, tone: "text-moss" });
  if (r.sample) items.push({ text: "Sample edition prepared in advance; fit ratings are illustrative", tone: "text-burgundy" });
  if (r.status === "partial") items.push({ text: r.preview ? "Preview edition: cases share wording with your letter and are not assessed for fit" : "Late edition: see the editorial for what is missing", tone: "text-amber" });
  if (!items.length) return null;
  return (
    <p role="status" className="label border-b border-ink py-2 text-center">
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
    <section aria-labelledby="sec-clarify" className="mx-auto max-w-3xl animate-rise space-y-6 py-10">
      <SectionHeading id="sec-clarify" numeral="From the desk" title="The editor has a question" />
      <p className="leading-relaxed text-ink-soft">
        {response.profile?.decision ? (
          <>
            We read your letter as: <span className="text-ink italic">{response.profile.decision}</span>.{" "}
          </>
        ) : null}
        Before we go to press, we need one more detail, because it would change what is worth recommending.
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
            <span className="block font-display text-[1.6rem] leading-tight font-black text-ink">{q.question}</span>
            <span className="mt-1 block text-sm text-muted italic">{q.why_it_matters}</span>
            <textarea
              rows={2}
              maxLength={500}
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
              className="mt-3 block w-full border border-ink bg-transparent px-3 py-2.5 text-ink focus:outline-none"
            />
          </label>
        ))}
        <Button type="submit" disabled={!ready || busy}>
          Send the answer
        </Button>
      </form>
    </section>
  );
}

function InsufficientPanel({ response, onEditContext }: { response: InsufficientEvidenceResponse; onEditContext: () => void }) {
  return (
    <section aria-labelledby="sec-nomatch" className="mx-auto max-w-3xl animate-rise space-y-6 py-10">
      <SectionHeading id="sec-nomatch" numeral="Correction" title={response.reason === "evidence_removed" ? "Not enough verified evidence to print" : "No precedent found"} />
      <div className="grid h-40 place-items-center border-2 border-dashed border-ink/40">
        <p className="label text-muted">This space intentionally left blank</p>
      </div>
      <p className="text-[1.25rem] leading-relaxed text-ink italic">{response.message}</p>
      <p className="leading-relaxed text-ink-soft">Rather than force a comparison, we are printing nothing. A weak analogy can mislead more than it helps.</p>
      {response.near_misses.length ? (
        <div>
          <Label>Closest cases considered</Label>
          <ul className="space-y-3">
            {response.near_misses.map((m) => (
              <li key={m.case_id} className="border border-ink px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-display text-lg font-black text-ink">{m.title}</p>
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
        Rewrite your letter
      </Button>
      <p className="font-mono text-[0.68rem] text-muted">
        {response.request_id} · corpus {response.versions.corpus} · {response.versions.rubric}
        {response.versions.jev_model ? ` · ${response.versions.jev_model}` : ""}
      </p>
    </section>
  );
}
