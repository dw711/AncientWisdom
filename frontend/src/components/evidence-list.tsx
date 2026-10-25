import type { CaseCard, ClaimView, PassageView, SourceView } from "@/lib/contracts/advice";
import { ArrowUpRight, Tag, cx } from "./ui";

const TYPE_LABEL: Record<ClaimView["type"], { label: string; tone: "outline" | "amber" | "moss" }> = {
  observation: { label: "Recorded fact", tone: "outline" },
  interpretation: { label: "Attributed interpretation", tone: "amber" },
  outcome: { label: "Outcome", tone: "moss" },
};

const PHASE_ORDER: ClaimView["phase"][] = ["pre_decision", "decision", "unspecified", "outcome"];
const PHASE_LABEL: Record<ClaimView["phase"], string> = {
  pre_decision: "Before the decision",
  decision: "The decision",
  unspecified: "From the record",
  outcome: "Afterwards",
};

const SOURCE_TYPE: Record<SourceView["source_type"], string> = {
  primary: "Primary record",
  official_secondary: "Official summary",
  secondary: "Secondary account",
  reference: "Reference work",
};

const link = "inline-flex items-center gap-1 font-medium text-ink underline decoration-ink/25 decoration-[1.5px] underline-offset-4 hover:decoration-ink";

/**
 * Disputes, claims with their exact passages, and source records for one
 * case. Presentational only, so the drawer and the story page share it.
 */
export function CaseEvidence({
  card,
  claims,
  passages,
  sources,
  refs,
  focusClaimId,
  headingLevel = "h3",
}: {
  card: CaseCard;
  claims: ClaimView[];
  passages: PassageView[];
  sources: SourceView[];
  refs?: Record<string, number> | null;
  focusClaimId?: string | null;
  headingLevel?: "h2" | "h3";
}) {
  const H = headingLevel;
  const heading = "mb-2 text-lg font-semibold tracking-[-0.02em] text-ink";
  const passageById = new Map(passages.map((p) => [p.passage_id, p]));
  const sourceById = new Map(sources.map((s) => [s.source_id, s]));
  const caseSources = card.source_ids.map((id) => sourceById.get(id)).filter((s): s is SourceView => Boolean(s));
  const ordered = [...claims].sort((a, b) => (refs?.[a.claim_id] ?? 999) - (refs?.[b.claim_id] ?? 999));

  return (
    <div className="space-y-10">
      {card.disputes.length ? (
        <section>
          <H className={heading}>Accounts differ</H>
          {card.disputes.map((d) => (
            <div key={d.dispute_id} className="mt-3 rounded-xl bg-amber-wash p-5 text-sm">
              <p className="mb-2 font-medium text-ink">{d.summary}</p>
              <ul className="space-y-1.5 font-light text-ink-soft">
                {d.positions.map((pos) => (
                  <li key={pos.attribution}>
                    <span className="font-medium text-ink">{pos.attribution}:</span> {pos.position}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : card.dispute_note ? (
        <section>
          <H className={heading}>How the accounts compare</H>
          <p className="mt-3 rounded-xl bg-amber-wash p-5 text-sm leading-relaxed font-light text-ink-soft">{card.dispute_note}</p>
        </section>
      ) : null}

      {PHASE_ORDER.map((phase) => {
        const inPhase = ordered.filter((c) => c.phase === phase);
        if (!inPhase.length) return null;
        return (
          <section key={phase}>
            <H className={heading}>{PHASE_LABEL[phase]}</H>
            <ol>
              {inPhase.map((claim) => (
                <li
                  key={claim.claim_id}
                  id={`claim-${claim.claim_id}`}
                  tabIndex={-1}
                  className={cx("dots-b -mx-3 scroll-mt-24 rounded-lg px-3 py-5 transition-colors", focusClaimId === claim.claim_id && "bg-highlight-wash")}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {refs?.[claim.claim_id] ? <span className="text-sm font-semibold text-ink tabular-nums">[{refs[claim.claim_id]}]</span> : null}
                    <Tag tone={TYPE_LABEL[claim.type].tone}>{TYPE_LABEL[claim.type].label}</Tag>
                    <span className="font-mono text-[0.62rem] text-muted">{claim.claim_id}</span>
                  </div>
                  <p className="leading-relaxed text-ink">{claim.statement}</p>
                  {claim.attribution ? <p className="mt-1 text-xs text-muted">Attribution: {claim.attribution}</p> : null}
                  {claim.passage_ids.map((pid) => {
                    const passage = passageById.get(pid);
                    if (!passage) return null;
                    const source = sourceById.get(passage.source_id);
                    return (
                      <figure key={pid} className="mt-4 border-l-2 border-ink/80 pl-4">
                        <blockquote className="leading-relaxed font-light text-ink-soft italic">{passage.text}</blockquote>
                        <figcaption className="mt-2 text-xs text-muted">
                          {source ? source.title : passage.source_id}
                          {passage.locator ? ` · ${passage.locator}` : ""}
                        </figcaption>
                      </figure>
                    );
                  })}
                </li>
              ))}
            </ol>
          </section>
        );
      })}

      {caseSources.length ? (
        <section>
          <H className={heading}>Source records</H>
          <ul className="mt-3 space-y-3">
            {caseSources.map((s) => (
              <li key={s.source_id} className="rounded-xl border border-rule-soft bg-paper p-5 text-sm">
                <p className="font-semibold text-ink">{s.title}</p>
                <p className="mt-1 font-light text-ink-soft">{[s.institution, s.author, s.publication_date_display].filter(Boolean).join(" · ")}</p>
                <p className="mt-2 text-xs text-muted">
                  {SOURCE_TYPE[s.source_type]}
                  {s.retrieved_at ? ` · Retrieved ${s.retrieved_at}` : ""}
                </p>
                {s.retrieval_note ? <p className="mt-1 text-xs text-muted">{s.retrieval_note}</p> : null}
                {s.rights_note ? <p className="mt-1 text-xs text-muted">{s.rights_note}</p> : null}
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className={link}>
                    Original source<span className="sr-only"> (opens in a new tab)</span>
                    <ArrowUpRight />
                  </a>
                  {s.archived_url ? (
                    <a href={s.archived_url} target="_blank" rel="noopener noreferrer" className={link}>
                      Archived copy<span className="sr-only"> (opens in a new tab)</span>
                      <ArrowUpRight />
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-xs leading-relaxed text-muted">
        Passages are exact excerpts stored with the case{card.reviewed_at ? `, which was reviewed and approved on ${card.reviewed_at}` : ""}. A link shows where the text comes from; it
        does not by itself prove the claim.
      </p>
    </div>
  );
}
