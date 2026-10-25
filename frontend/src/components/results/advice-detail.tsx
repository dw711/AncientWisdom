"use client";

import type { CheckState, ConstraintKey, PartialResponse, ReadyResponse } from "@/lib/contracts/advice";
import { ArrowLabel, BulletList, Button, CloseButton, Disclosure, Label, Tag, cx } from "../ui";

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

/**
 * The advice, shown when the person selects "Your decision" at the end of the
 * timeline. The recommendation leads on a dark band; how we read the decision
 * and how the answer was checked are folded away.
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
  const unknown = p ? [...new Set([...p.uncertainties, ...r.uncertainties])].slice(0, 6) : [];

  return (
    <article className="animate-rise rounded-[6px] border border-rule-soft bg-card shadow-[0_40px_90px_-60px_rgb(20_14_6/0.45)]" aria-label="Your decision">
      <div className="relative overflow-hidden rounded-t-[5px] bg-night p-5 pb-10 text-white sm:p-12 sm:pb-14">
        <CloseButton tone="dark" onClick={onClose} className="absolute top-4 right-4 sm:top-6 sm:right-6" />
        <p className="eyebrow flex items-center gap-3 text-accent">
          <span aria-hidden="true" className="size-2 rotate-45 rounded-[1px] bg-accent" />
          Today · Your decision
        </p>
        <p className="mt-5 max-w-3xl pr-12 text-[1.1rem] leading-relaxed text-white/75">{r.decision_summary ?? p?.decision}</p>

        {r.recommendation ? (
          <div className="stagger mt-10 [--d:150] sm:mt-14">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <p className="eyebrow text-white/80">Recommendation</p>
              <Tag tone="on-dark">Modern inference, not historical fact</Tag>
            </div>
            <p className="display max-w-4xl text-[clamp(1.9rem,3.6vw,3.25rem)] leading-[1.08]">{r.recommendation.text}</p>
            {r.recommendation.conditions.length ? (
              <p className="mt-6 max-w-3xl border-l border-accent/60 pl-5 leading-relaxed text-white/70">
                <span className="font-semibold text-white">Applies if </span>
                {r.recommendation.conditions.map((c) => lowerFirst(c.replace(/\.$/, ""))).join("; ")}.
              </p>
            ) : null}
          </div>
        ) : partial ? (
          <div className="mt-8 max-w-3xl rounded-[4px] border border-white/15 bg-white/[0.04] px-5 py-4">
            <p className="font-semibold">{partial.preview ? "Preview mode" : "No advice this time"}</p>
            <p className="mt-1 leading-relaxed text-white/70">{partial.message}</p>
          </div>
        ) : null}
      </div>

      {r.alternatives.length || r.lesson_tension ? (
        <div className="stagger px-5 py-7 [--d:260] sm:px-12 sm:py-10">
          {r.alternatives.length ? (
            <>
              <Label>Alternatives</Label>
              <ul>
                {r.alternatives.map((a, i) => (
                  <li key={i} className="grid gap-1 border-b border-rule-soft py-4 sm:grid-cols-[minmax(0,18rem)_1fr] sm:gap-8">
                    <span className="display text-[1.15rem] leading-snug text-ink">{a.condition}</span>
                    <span className="leading-relaxed text-ink-soft">{a.action}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {r.lesson_tension ? (
            <p className={cx("max-w-4xl leading-relaxed text-ink-soft", r.alternatives.length > 0 && "mt-7")}>
              <span className="font-display text-[1.1em] text-ink italic">Where the cases disagree. </span>
              {r.lesson_tension}
            </p>
          ) : null}
        </div>
      ) : null}

      {r.next_steps.length || r.what_would_change.length ? (
        <div className="grid border-t border-rule-soft md:grid-cols-2">
          {r.next_steps.length ? (
            <div className="stagger p-5 [--d:360] sm:p-12">
              <Label>Next steps</Label>
              <ol>
                {r.next_steps.map((s, i) => (
                  <li key={i} className="flex gap-5 border-b border-rule-soft py-4">
                    <span className="display w-9 shrink-0 text-[1.6rem] leading-none text-accent-ink italic tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    <span className="leading-relaxed text-ink">{s.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {r.what_would_change.length ? (
            <div className="stagger border-t border-rule-soft p-5 [--d:460] first:border-t-0 sm:p-12 md:border-t-0 md:border-l md:first:border-l-0">
              <Label>What would change the advice</Label>
              <ul>
                {r.what_would_change.map((c, i) => (
                  <li key={i} className="border-b border-rule-soft py-4">
                    <p className="font-semibold text-ink">{c.condition}</p>
                    <p className="mt-1 text-[0.95rem] leading-relaxed text-ink-soft">{c.effect}</p>
                    {c.suggested_update ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onApplyChange(c.suggested_update!.key, c.suggested_update!.value, c.suggested_update!.label)}
                        className="mt-3 text-sm font-semibold text-ink disabled:opacity-50"
                      >
                        <ArrowLabel>Re-run with this change</ArrowLabel>
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {p ? (
        <Disclosure title="How we read your decision">
          <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {p.options.length ? (
              <div>
                <Label>Options</Label>
                <BulletList items={p.options} className="text-ink-soft" />
              </div>
            ) : null}
            {stated.length ? (
              <div>
                <Label>What you told us</Label>
                <BulletList items={stated} className="text-ink-soft" />
              </div>
            ) : null}
            {p.assumptions.length ? (
              <div>
                <Label>What we assumed</Label>
                <BulletList items={p.assumptions} className="text-ink-soft" />
              </div>
            ) : null}
            {unknown.length ? (
              <div>
                <Label>Still unknown</Label>
                <BulletList items={unknown} className="text-ink-soft" />
              </div>
            ) : null}
          </div>
          <Button variant="secondary" className="mt-6" onClick={onEditContext}>
            Correct an assumption or add context
          </Button>
        </Disclosure>
      ) : null}

      <Disclosure title="How this answer was checked">
        {r.validation ? (
          <dl className="grid gap-x-10 text-sm sm:grid-cols-2">
            {(
              [
                ["Evidence IDs", r.validation.evidence_ids],
                ["Exact quotations", r.validation.quotations],
                ["Claim support (model check)", r.validation.claim_support],
                ["Consistency of advice", r.validation.consistency],
              ] as [string, CheckState][]
            ).map(([label, state]) => (
              <div key={label} className="flex justify-between gap-3 border-b border-rule-soft py-3">
                <dt className="text-ink-soft">{label}</dt>
                <dd className={cx("font-semibold", state === "passed" || state === "repaired" || state === "not_applicable" ? "text-moss" : state === "skipped" ? "text-muted" : "text-amber")}>
                  {CHECK_LABEL[state]}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-ink-soft">No written advice was produced, so there was nothing to check.</p>
        )}
        {r.validation?.removed.length ? (
          <ul className="mt-4 space-y-1 text-sm text-ink-soft">
            {r.validation.removed.map((x, i) => (
              <li key={i}>
                Removed: {x.item} <span className="text-muted">({x.reason})</span>
              </li>
            ))}
          </ul>
        ) : null}
        <ul className="mt-4 space-y-1 text-xs leading-relaxed text-muted">
          {[...new Set([...(r.validation?.notes ?? []), ...r.warnings])].map((n) => (
            <li key={n}>{n}</li>
          ))}
          <li>Automated checks reduce the risk of errors but cannot guarantee that every claim or inference is right.</li>
        </ul>
        <p className="mt-4 font-mono text-[0.66rem] break-all text-muted">
          {r.sample ? "sample · " : ""}
          {r.request_id} · corpus {r.versions.corpus} · {r.versions.rubric}
          {r.versions.jev_model ? ` · ${r.versions.jev_model}` : ""}
          {r.versions.llm_model ? ` · ${r.versions.llm_model}` : ""}
        </p>
      </Disclosure>
    </article>
  );
}
