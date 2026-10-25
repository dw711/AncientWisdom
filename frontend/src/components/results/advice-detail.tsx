"use client";

import type { ReactNode } from "react";
import type { CheckState, ConstraintKey, PartialResponse, ReadyResponse } from "@/lib/contracts/advice";
import { BulletList, Button, Label, cx } from "../ui";

const CHECK_LABEL: Record<CheckState, string> = {
  passed: "passed",
  repaired: "passed after one repair",
  items_removed: "failing items removed",
  failed: "failed",
  skipped: "not run",
  not_applicable: "nothing to check",
};

function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group border-t border-ink/35 pt-4">
      <summary className="label cursor-pointer list-none text-ink-soft hover:text-ink">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span> {title}
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

/**
 * The editorial: what to do next. The recommendation itself leads the front
 * page and the paths ledger, so this holds how we read the decision, the next
 * steps and what would change our view; how we read the letter and how the
 * answer was checked are folded.
 */
export function AdviceDetail({
  response,
  busy,
  onApplyChange,
  onEditContext,
}: {
  response: ReadyResponse | PartialResponse;
  busy: boolean;
  onApplyChange: (key: ConstraintKey, value: string | number | boolean, label: string) => void;
  onEditContext: () => void;
}) {
  const r = response;
  const p = r.profile;
  const stated = p ? [...new Set([...p.known_constraints, ...p.known_facts])] : [];

  return (
    <article aria-label="The editorial" className="grid gap-10 lg:grid-cols-12 lg:gap-0">
      <div className="lg:col-span-7 lg:border-r lg:border-ink lg:pr-10">
        <p className="label text-muted">The decision, as we read it</p>
        <p className="mt-2 text-[1.1rem] leading-relaxed text-ink-soft italic">{r.decision_summary ?? p?.decision}</p>

        {r.lesson_tension ? (
          <p className="mt-6 border-l-2 border-burgundy py-1 pl-4 leading-relaxed text-ink-soft">
            <span className="text-ink">Where the editions disagree. </span>
            {r.lesson_tension}
          </p>
        ) : null}

        {r.next_steps.length ? (
          <div className="mt-10">
            <Label>Next steps</Label>
            <ol className="space-y-4">
              {r.next_steps.map((s, i) => (
                <li key={i} className="flex gap-4 border-b border-ink/20 pb-3">
                  <span className="font-display text-2xl leading-none font-black text-burgundy">{i + 1}</span>
                  <span className="text-[1.05rem] leading-relaxed text-ink">{s.text}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>

      <div className="space-y-8 lg:col-span-5 lg:pl-10">
        {r.what_would_change.length ? (
          <div>
            <Label>What would change our view</Label>
            <ul className="space-y-3">
              {r.what_would_change.map((c, i) => (
                <li key={i} className="border border-ink px-4 py-3">
                  <p className="text-ink">{c.condition}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{c.effect}</p>
                  {c.suggested_update ? (
                    <Button
                      variant="secondary"
                      className="mt-3 px-3 py-1.5"
                      disabled={busy}
                      onClick={() => onApplyChange(c.suggested_update!.key, c.suggested_update!.value, c.suggested_update!.label)}
                    >
                      Reprint with this change
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="space-y-4 lg:col-span-12 lg:mt-10">
        {p ? (
          <Disclosure title="How we read your letter">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {p.options.length ? (
                <div>
                  <Label>Options</Label>
                  <BulletList items={p.options} className="text-[0.95rem] text-ink-soft" />
                </div>
              ) : null}
              {stated.length ? (
                <div>
                  <Label>What you told us</Label>
                  <BulletList items={stated} className="text-[0.95rem] text-ink-soft" />
                </div>
              ) : null}
              {p.assumptions.length ? (
                <div>
                  <Label>What we assumed</Label>
                  <BulletList items={p.assumptions} className="text-[0.95rem] text-ink-soft" />
                </div>
              ) : null}
              {[...p.uncertainties, ...r.uncertainties].length ? (
                <div>
                  <Label>Still unknown</Label>
                  <BulletList items={[...new Set([...p.uncertainties, ...r.uncertainties])].slice(0, 6)} className="text-[0.95rem] text-ink-soft" />
                </div>
              ) : null}
            </div>
            <Button variant="quiet" className="mt-4 -ml-1" onClick={onEditContext}>
              Correct an assumption or add context
            </Button>
          </Disclosure>
        ) : null}

        <Disclosure title="How this edition was checked">
          {r.validation ? (
            <dl className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
              {(
                [
                  ["Evidence IDs", r.validation.evidence_ids],
                  ["Exact quotations", r.validation.quotations],
                  ["Claim support (model check)", r.validation.claim_support],
                  ["Consistency of advice", r.validation.consistency],
                ] as [string, CheckState][]
              ).map(([label, state]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-ink/20 pb-1">
                  <dt className="text-ink-soft">{label}</dt>
                  <dd className={cx(state === "passed" || state === "repaired" || state === "not_applicable" ? "text-moss" : state === "skipped" ? "text-muted" : "text-amber")}>
                    {CHECK_LABEL[state]}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-ink-soft">No written advice was produced, so there was nothing to check.</p>
          )}
          {r.validation?.removed.length ? (
            <ul className="mt-3 space-y-0.5 text-sm text-ink-soft">
              {r.validation.removed.map((x, i) => (
                <li key={i}>
                  Removed: {x.item} <span className="text-muted">({x.reason})</span>
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="mt-3 space-y-1 text-xs leading-relaxed text-muted">
            {[...new Set([...(r.validation?.notes ?? []), ...r.warnings])].map((n) => (
              <li key={n}>{n}</li>
            ))}
            <li>Automated checks reduce the risk of errors but cannot guarantee that every claim or inference is right.</li>
          </ul>
          <p className="mt-3 font-mono text-[0.66rem] break-all text-muted">
            {r.sample ? "sample · " : ""}
            {r.request_id} · corpus {r.versions.corpus} · {r.versions.rubric}
            {r.versions.jev_model ? ` · ${r.versions.jev_model}` : ""}
            {r.versions.llm_model ? ` · ${r.versions.llm_model}` : ""}
          </p>
        </Disclosure>
      </div>
    </article>
  );
}
