"use client";

import type { ReactNode } from "react";
import type { CheckState, ConstraintKey, PartialResponse, ReadyResponse } from "@/lib/contracts/advice";
import { BulletList, Button, Label, Tag, cx } from "../ui";

const CHECK_LABEL: Record<CheckState, string> = {
  passed: "passed",
  repaired: "passed after one repair",
  items_removed: "failing items removed",
  failed: "failed",
  skipped: "not run",
  not_applicable: "nothing to check",
};

/** Lower-cases a leading capital unless the word is an acronym ("NASA"). */
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group border-t border-rule-soft pt-4">
      <summary className="cursor-pointer list-none text-sm font-medium text-ink-soft hover:text-ink">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span> {title}
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

/**
 * The advice, shown when the person selects "Your decision" at the end of the
 * timeline. The recommendation leads; how we read the decision and how the
 * answer was checked are folded away.
 */
export function AdviceDetail({
  response,
  busy,
  onApplyChange,
  onEditContext,
  onClose,
}: {
  response: ReadyResponse | PartialResponse;
  busy: boolean;
  onApplyChange: (key: ConstraintKey, value: string | number | boolean, label: string) => void;
  onEditContext: () => void;
  onClose: () => void;
}) {
  const r = response;
  const partial = r.status === "partial" ? r : null;
  const p = r.profile;
  const stated = p ? [...new Set([...p.known_constraints, ...p.known_facts])] : [];

  return (
    <article className="animate-rise rounded-xl border border-burgundy/25 bg-card p-6 shadow-[0_18px_48px_-28px_rgb(29_26_22/0.35)] sm:p-8" aria-label="Your decision">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-burgundy uppercase">Today · Your decision</p>
          <p className="mt-2 max-w-3xl font-serif text-[1.15rem] leading-relaxed text-ink-soft">{r.decision_summary ?? p?.decision}</p>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 rounded-md px-2 py-1 text-2xl leading-none text-muted hover:bg-paper-deep hover:text-ink" aria-label="Close details">
          ×
        </button>
      </div>

      {r.recommendation ? (
        <div className="mt-7">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <p className="text-[0.68rem] font-semibold tracking-[0.14em] text-muted uppercase">Recommendation</p>
            <Tag tone="bronze">Modern inference, not historical fact</Tag>
          </div>
          <p className="border-l-2 border-burgundy pl-5 font-serif text-[clamp(1.3rem,2.2vw,1.65rem)] leading-snug text-ink">{r.recommendation.text}</p>
          {r.recommendation.conditions.length ? (
            <p className="mt-3 pl-5 text-sm leading-relaxed text-ink-soft">
              <span className="font-medium text-ink">Applies if </span>
              {r.recommendation.conditions.map((c) => lowerFirst(c.replace(/\.$/, ""))).join("; ")}.
            </p>
          ) : null}
        </div>
      ) : partial ? (
        <div className="mt-6 rounded-md border border-amber/30 bg-amber-wash px-4 py-3 text-sm text-ink">
          <p className="font-medium">{partial.preview ? "Preview mode" : "No advice this time"}</p>
          <p className="mt-1 leading-relaxed text-ink-soft">{partial.message}</p>
        </div>
      ) : null}

      {r.alternatives.length || r.lesson_tension ? (
        <div className="mt-6 grid gap-3">
          {r.alternatives.map((a, i) => (
            <div key={i} className="rounded-md bg-paper-deep/60 px-4 py-3 text-[0.95rem]">
              <span className="font-medium text-ink">{a.condition}: </span>
              <span className="text-ink-soft">{a.action}</span>
            </div>
          ))}
          {r.lesson_tension ? (
            <p className="text-[0.95rem] leading-relaxed text-ink-soft">
              <span className="font-medium text-ink">Where the cases disagree. </span>
              {r.lesson_tension}
            </p>
          ) : null}
        </div>
      ) : null}

      {r.next_steps.length || r.what_would_change.length ? (
        <div className="mt-8 grid gap-8 md:grid-cols-2">
          {r.next_steps.length ? (
            <div>
              <Label>Next steps</Label>
              <ol className="space-y-3">
                {r.next_steps.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="font-serif text-xl leading-none text-bronze">{i + 1}</span>
                    <span className="leading-relaxed text-ink">{s.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {r.what_would_change.length ? (
            <div>
              <Label>What would change the advice</Label>
              <ul className="space-y-3">
                {r.what_would_change.map((c, i) => (
                  <li key={i} className="rounded-md border border-rule-soft px-4 py-3">
                    <p className="text-[0.95rem] font-medium text-ink">{c.condition}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{c.effect}</p>
                    {c.suggested_update ? (
                      <Button
                        variant="quiet"
                        className="mt-1 -ml-1.5 text-sm"
                        disabled={busy}
                        onClick={() => onApplyChange(c.suggested_update!.key, c.suggested_update!.value, c.suggested_update!.label)}
                      >
                        Re-run with this change
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8 space-y-4">
        {p ? (
          <Disclosure title="How we read your decision">
            <div className="grid gap-6 sm:grid-cols-2">
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
            <Button variant="quiet" className="mt-4 -ml-1.5" onClick={onEditContext}>
              Correct an assumption or add context
            </Button>
          </Disclosure>
        ) : null}

        <Disclosure title="How this answer was checked">
          {r.validation ? (
            <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {(
                [
                  ["Evidence IDs", r.validation.evidence_ids],
                  ["Exact quotations", r.validation.quotations],
                  ["Claim support (model check)", r.validation.claim_support],
                  ["Consistency of advice", r.validation.consistency],
                ] as [string, CheckState][]
              ).map(([label, state]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-rule-soft/70 pb-1">
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
