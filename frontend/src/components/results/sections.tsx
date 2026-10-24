"use client";

import type {
  ChangeCondition,
  ConditionalAlternative,
  ConstraintKey,
  DecisionProfile,
  NextStep,
  Recommendation,
  SourceConflict,
  ValidationReport,
  Versions,
  CheckState,
} from "@/lib/contracts/advice";
import { BulletList, Button, Label, SectionHeading, Tag } from "../ui";

export function DecisionSection({ summary, profile, onEditContext }: { summary: string | null; profile: DecisionProfile | null; onEditContext: () => void }) {
  if (!profile && !summary) return null;
  const stated = profile ? [...new Set([...profile.known_constraints, ...profile.known_facts])] : [];
  return (
    <section aria-labelledby="sec-decision" className="animate-rise">
      <SectionHeading id="sec-decision" numeral="I" title="Your decision" aside={profile?.source === "fallback" ? "Read directly from your description" : null} />
      {summary ? <p className="font-serif text-[1.3rem] leading-relaxed text-ink">{summary}</p> : profile ? <p className="font-serif text-[1.3rem] leading-relaxed text-ink">{profile.decision}</p> : null}
      {profile ? (
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {profile.options.length ? (
            <div>
              <Label>Options</Label>
              <BulletList items={profile.options} className="text-[0.95rem] text-ink-soft" />
            </div>
          ) : null}
          {stated.length ? (
            <div>
              <Label>What you told us</Label>
              <BulletList items={stated} className="text-[0.95rem] text-ink-soft" />
            </div>
          ) : null}
          {profile.assumptions.length ? (
            <div>
              <Label>Assumptions we made</Label>
              <BulletList
                items={profile.assumptions.map((a) => (
                  <span key={a}>
                    <Tag tone="amber">Assumed</Tag> <span className="ml-1">{a}</span>
                  </span>
                ))}
                className="text-[0.95rem] text-ink-soft"
              />
            </div>
          ) : null}
          {profile.uncertainties.length ? (
            <div>
              <Label>Still unknown</Label>
              <BulletList items={profile.uncertainties} className="text-[0.95rem] text-ink-soft" />
            </div>
          ) : null}
          {profile.user_interpretations.length ? (
            <div className="sm:col-span-2">
              <Label>Your reading of the situation</Label>
              <p className="mb-1 text-xs text-muted">Kept separate from facts: these are interpretations, not established.</p>
              <BulletList items={profile.user_interpretations} className="text-[0.95rem] text-ink-soft" />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="mt-5">
        <Button variant="quiet" onClick={onEditContext}>
          Correct an assumption or add context
        </Button>
      </div>
    </section>
  );
}

export function RecommendationSection({
  recommendation,
  alternatives,
  tension,
}: {
  recommendation: Recommendation;
  alternatives: ConditionalAlternative[];
  tension: string | null;
}) {
  return (
    <section aria-labelledby="sec-rec" className="animate-rise">
      <SectionHeading id="sec-rec" numeral="II" title="Recommendation" aside={<Tag tone="bronze">Modern inference, not historical fact</Tag>} />
      <p className="border-l-2 border-burgundy pl-5 font-serif text-[1.4rem] leading-relaxed text-ink">{recommendation.text}</p>
      {recommendation.conditions.length ? (
        <div className="mt-5">
          <Label>This applies if</Label>
          <BulletList items={recommendation.conditions} className="text-ink-soft" />
        </div>
      ) : null}
      {alternatives.length ? (
        <div className="mt-6 space-y-3">
          <Label>If things are different</Label>
          {alternatives.map((a, i) => (
            <div key={i} className="rounded-md border border-rule-soft bg-card px-4 py-3">
              <p className="text-sm font-medium text-ink">{a.condition}</p>
              <p className="mt-1 leading-relaxed text-ink-soft">{a.action}</p>
            </div>
          ))}
        </div>
      ) : null}
      {tension ? (
        <div className="mt-6 rounded-md bg-paper-deep/70 px-4 py-3.5">
          <Label>Where the cases point different ways</Label>
          <p className="leading-relaxed text-ink-soft">{tension}</p>
        </div>
      ) : null}
    </section>
  );
}

export function NextStepsSection({ steps }: { steps: NextStep[] }) {
  if (!steps.length) return null;
  return (
    <section aria-labelledby="sec-next" className="animate-rise">
      <SectionHeading id="sec-next" numeral="V" title="Next steps" />
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-4">
            <span className="mt-0.5 font-serif text-xl leading-none text-bronze">{i + 1}</span>
            <p className="leading-relaxed text-ink">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ChangeSection({
  items,
  uncertainties,
  onApply,
  onEditContext,
  busy,
}: {
  items: ChangeCondition[];
  uncertainties: string[];
  onApply: (key: ConstraintKey, value: string | number | boolean, label: string) => void;
  onEditContext: () => void;
  busy: boolean;
}) {
  if (!items.length && !uncertainties.length) return null;
  return (
    <section aria-labelledby="sec-change" className="animate-rise">
      <SectionHeading id="sec-change" numeral="VI" title="What would change the advice" />
      <ul className="divide-y divide-rule-soft border-y border-rule-soft">
        {items.map((c, i) => (
          <li key={i} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-medium text-ink">{c.condition}</p>
              <p className="mt-1 text-[0.95rem] leading-relaxed text-ink-soft">{c.effect}</p>
            </div>
            {c.suggested_update ? (
              <Button
                variant="secondary"
                className="shrink-0"
                disabled={busy}
                onClick={() => onApply(c.suggested_update!.key, c.suggested_update!.value, c.suggested_update!.label)}
              >
                Re-run with this change
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {uncertainties.length ? (
        <div className="mt-5">
          <Label>Open questions</Label>
          <BulletList items={uncertainties} className="text-[0.95rem] text-ink-soft" />
        </div>
      ) : null}
      <p className="mt-5 text-sm text-ink-soft">
        Something else has changed?{" "}
        <Button variant="quiet" onClick={onEditContext}>
          Update your context and run a fresh analysis
        </Button>
      </p>
    </section>
  );
}

export function SourceConflicts({ conflicts }: { conflicts: SourceConflict[] }) {
  if (!conflicts.length) return null;
  return (
    <div className="rounded-md border border-amber/25 bg-amber-wash/60 px-4 py-3 text-sm">
      <p className="font-medium text-amber">Historical accounts disagree</p>
      <ul className="mt-1 space-y-1 text-ink-soft">
        {conflicts.map((c) => (
          <li key={c.dispute_id}>{c.summary}</li>
        ))}
      </ul>
    </div>
  );
}

const CHECK_LABEL: Record<CheckState, string> = {
  passed: "passed",
  repaired: "passed after one repair",
  items_removed: "failing items removed",
  failed: "failed",
  skipped: "not run",
  not_applicable: "nothing to check",
};

export function ValidationFooter({
  validation,
  versions,
  requestId,
  sample,
  warnings,
}: {
  validation: ValidationReport | null;
  versions: Versions;
  requestId: string;
  sample: boolean;
  warnings: string[];
}) {
  const rows: [string, CheckState][] = validation
    ? [
        ["Answer structure", validation.schema],
        ["Evidence IDs", validation.evidence_ids],
        ["Exact quotations", validation.quotations],
        ["Claim support (model check)", validation.claim_support],
        ["Consistency of advice", validation.consistency],
      ]
    : [];
  return (
    <section aria-labelledby="sec-checks" className="rounded-lg border border-rule-soft bg-paper-deep/40 p-5 text-sm">
      <h2 id="sec-checks" className="font-serif text-lg text-ink">
        How this answer was checked
      </h2>
      {rows.length ? (
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {rows.map(([label, state]) => (
            <div key={label} className="flex justify-between gap-3 border-b border-rule-soft/70 pb-1">
              <dt className="text-ink-soft">{label}</dt>
              <dd className={state === "passed" || state === "repaired" || state === "not_applicable" ? "text-moss" : state === "skipped" ? "text-muted" : "text-amber"}>
                {CHECK_LABEL[state]}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {validation?.removed.length ? (
        <div className="mt-4">
          <p className="font-medium text-ink">Removed before showing you</p>
          <ul className="mt-1 space-y-0.5 text-ink-soft">
            {validation.removed.map((r, i) => (
              <li key={i}>
                {r.item}: <span className="text-muted">{r.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {[...(validation?.notes ?? []), ...warnings].length ? (
        <ul className="mt-4 space-y-1 text-xs leading-relaxed text-muted">
          {[...new Set([...(validation?.notes ?? []), ...warnings])].map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-4 text-xs leading-relaxed text-muted">
        Automated checks reduce the risk of errors but cannot guarantee that every claim or inference is right.
      </p>
      <p className="mt-3 font-mono text-[0.68rem] leading-relaxed break-all text-muted">
        {sample ? "sample · " : ""}
        {requestId} · corpus {versions.corpus} · {versions.rubric} · {versions.weights}
        {versions.jev_model ? ` · ${versions.jev_model}` : ""}
        {versions.llm_model ? ` · ${versions.llm_model}` : ""}
      </p>
    </section>
  );
}
