"use client";

import type { ReactNode } from "react";
import type { CheckState, ConstraintKey, PartialResponse, ReadyResponse } from "@/lib/contracts/advice";
import { BulletList, Button } from "../ui";

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

const Mono = ({ children }: { children: ReactNode }) => <p className="label mb-3 text-paper/55">{children}</p>;
const quiet = "text-paper decoration-paper/40 hover:decoration-paper";

function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group border-t border-paper/20 pt-4">
      <summary className="label cursor-pointer list-none text-paper/75 hover:text-paper">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span> {title}
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

/**
 * The advice, set on the ink ending of the fork. The recommendation leads;
 * how we read the decision and how the answer was checked are folded away.
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
  onClose?: () => void;
}) {
  const r = response;
  const partial = r.status === "partial" ? r : null;
  const p = r.profile;
  const stated = p ? [...new Set([...p.known_constraints, ...p.known_facts])] : [];

  return (
    <article aria-label="Your decision" className="text-paper">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Mono>How we read it</Mono>
          <p className="max-w-3xl text-[1.1rem] leading-relaxed text-paper/80">{r.decision_summary ?? p?.decision}</p>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} className="shrink-0 px-2 py-1 text-2xl leading-none text-paper/60 hover:text-paper" aria-label="Close details">
            ×
          </button>
        ) : null}
      </div>

      {r.recommendation ? (
        <div className="mt-10">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <p className="label text-paper/55">Recommendation</p>
            <span className="rounded-full border border-dashed border-paper/40 px-2 py-[3px] font-mono text-[10px] tracking-[1px] text-paper/70 uppercase">
              ◇ Modern inference, not historical fact
            </span>
          </div>
          <p className="max-w-4xl font-serif text-[clamp(1.6rem,2.8vw,2.4rem)] leading-snug text-paper italic">{r.recommendation.text}</p>
          {r.recommendation.conditions.length ? (
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-paper/70">
              <span className="text-paper">Applies if </span>
              {r.recommendation.conditions.map((c) => lowerFirst(c.replace(/\.$/, ""))).join("; ")}.
            </p>
          ) : null}
        </div>
      ) : partial ? (
        <div className="mt-8 border border-paper/30 px-5 py-4">
          <p className="label text-paper">{partial.preview ? "Preview mode" : "No advice this time"}</p>
          <p className="mt-2 leading-relaxed text-paper/75">{partial.message}</p>
        </div>
      ) : null}

      {r.alternatives.length || r.lesson_tension ? (
        <div className="mt-8 grid gap-3">
          {r.alternatives.map((a, i) => (
            <div key={i} className="border-l-2 border-paper/40 py-1 pl-4 text-[0.98rem]">
              <span className="text-paper">{a.condition}: </span>
              <span className="text-paper/75">{a.action}</span>
            </div>
          ))}
          {r.lesson_tension ? (
            <p className="text-[0.98rem] leading-relaxed text-paper/75">
              <span className="text-paper">Where the paths disagree. </span>
              {r.lesson_tension}
            </p>
          ) : null}
        </div>
      ) : null}

      {r.next_steps.length || r.what_would_change.length ? (
        <div className="mt-12 grid gap-10 md:grid-cols-2">
          {r.next_steps.length ? (
            <div>
              <Mono>Next steps</Mono>
              <ol className="space-y-4">
                {r.next_steps.map((s, i) => (
                  <li key={i} className="flex gap-4">
                    <span className="font-mono text-sm text-paper/50">{String(i + 1).padStart(2, "0")}</span>
                    <span className="leading-relaxed text-paper">{s.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {r.what_would_change.length ? (
            <div>
              <Mono>What would change the advice</Mono>
              <ul className="space-y-3">
                {r.what_would_change.map((c, i) => (
                  <li key={i} className="border border-paper/20 px-4 py-3">
                    <p className="text-[0.98rem] text-paper">{c.condition}</p>
                    <p className="mt-1 text-sm leading-relaxed text-paper/70">{c.effect}</p>
                    {c.suggested_update ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onApplyChange(c.suggested_update!.key, c.suggested_update!.value, c.suggested_update!.label)}
                        className="label mt-3 rounded-full border border-paper/70 px-4 py-1.5 text-paper transition-colors hover:bg-paper hover:text-ink disabled:opacity-50"
                      >
                        Re-run with this change
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-12 space-y-4">
        {p ? (
          <Disclosure title="How we read your decision">
            <div className="grid gap-6 sm:grid-cols-2">
              {p.options.length ? (
                <div>
                  <Mono>Options</Mono>
                  <BulletList items={p.options} className="text-[0.95rem] text-paper/80" />
                </div>
              ) : null}
              {stated.length ? (
                <div>
                  <Mono>What you told us</Mono>
                  <BulletList items={stated} className="text-[0.95rem] text-paper/80" />
                </div>
              ) : null}
              {p.assumptions.length ? (
                <div>
                  <Mono>What we assumed</Mono>
                  <BulletList items={p.assumptions} className="text-[0.95rem] text-paper/80" />
                </div>
              ) : null}
              {[...p.uncertainties, ...r.uncertainties].length ? (
                <div>
                  <Mono>Still unknown</Mono>
                  <BulletList items={[...new Set([...p.uncertainties, ...r.uncertainties])].slice(0, 6)} className="text-[0.95rem] text-paper/80" />
                </div>
              ) : null}
            </div>
            <Button variant="quiet" className={`mt-4 -ml-1.5 ${quiet}`} onClick={onEditContext}>
              Correct an assumption or add context
            </Button>
          </Disclosure>
        ) : null}

        <Disclosure title="How this answer was checked">
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
                <div key={label} className="flex justify-between gap-3 border-b border-paper/15 pb-1">
                  <dt className="text-paper/75">{label}</dt>
                  <dd className={state === "passed" || state === "repaired" || state === "not_applicable" ? "text-[#9fc3a6]" : state === "skipped" ? "text-paper/50" : "text-[#e7b866]"}>
                    {CHECK_LABEL[state]}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-paper/75">No written advice was produced, so there was nothing to check.</p>
          )}
          {r.validation?.removed.length ? (
            <ul className="mt-3 space-y-0.5 text-sm text-paper/75">
              {r.validation.removed.map((x, i) => (
                <li key={i}>
                  Removed: {x.item} <span className="text-paper/50">({x.reason})</span>
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="mt-3 space-y-1 text-xs leading-relaxed text-paper/55">
            {[...new Set([...(r.validation?.notes ?? []), ...r.warnings])].map((n) => (
              <li key={n}>{n}</li>
            ))}
            <li>Automated checks reduce the risk of errors but cannot guarantee that every claim or inference is right.</li>
          </ul>
          <p className="mt-3 font-mono text-[0.66rem] break-all text-paper/45">
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
