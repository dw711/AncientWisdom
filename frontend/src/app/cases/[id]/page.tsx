import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { BackLink } from "@/components/back-link";
import { CaseEvidence } from "@/components/evidence-list";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { BulletList, Label, SectionHeading, Tag, cx } from "@/components/ui";
import { claimNumbers, formatYear } from "@/lib/case-refs";
import { CorpusError, getCaseRepository } from "@/lib/server/corpus";
import { evidenceViews, toCaseStory } from "@/lib/server/corpus/views";

export const metadata: Metadata = {
  title: "Historical story · Historical Figure",
  description: "The full story of a historical decision: the situation, the choice, what happened, and the sources.",
};

export default function CasePage({ params }: PageProps<"/cases/[id]">) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="bg-band">
        <SiteHeader />
      </div>
      <Suspense fallback={<StorySkeleton />}>{params.then(({ id }) => <Story id={decodeURIComponent(id)} />)}</Suspense>
      <SiteFooter />
    </div>
  );
}

/** The grey band under the header that holds the story's title. */
function Band({ children }: { children?: ReactNode }) {
  return (
    <div className="bg-band">
      <div className="mx-auto max-w-[90rem] px-4 pt-6 pb-16 sm:px-10 sm:pt-10 sm:pb-24">
        <BackLink />
        {children}
      </div>
    </div>
  );
}

function StorySkeleton() {
  return (
    <Band>
      <div className="mt-10 animate-pulse space-y-5" aria-busy="true" aria-label="Loading the story">
        <div className="h-4 w-40 rounded-[2px] bg-paper-deep" />
        <div className="h-20 w-3/4 rounded-[2px] bg-paper-deep" />
        <div className="h-5 w-2/3 rounded-[2px] bg-paper-deep" />
      </div>
    </Band>
  );
}

function Refs({ ids, refs, dark }: { ids: string[]; refs: Record<string, number>; dark?: boolean }) {
  if (!ids.length) return null;
  return (
    <span className="ml-0.5 align-super font-sans text-[0.7rem] leading-none font-semibold tracking-normal not-italic">
      {ids.map((id) => (
        <a
          key={id}
          href={`#claim-${id}`}
          className={cx("rounded-sm px-0.5", dark ? "text-accent hover:bg-white hover:text-night" : "text-accent-ink hover:bg-highlight hover:text-ink")}
          aria-label={`Source passage ${refs[id]}`}
        >
          [{refs[id]}]
        </a>
      ))}
    </span>
  );
}

const sectionId = (title: string) => `story-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;

function Section({ index, title, aside, children }: { index: string; title: string; aside?: ReactNode; children: ReactNode }) {
  const id = sectionId(title);
  return (
    <section aria-labelledby={id}>
      <SectionHeading id={id} index={index} title={title} aside={aside} />
      {children}
    </section>
  );
}

async function Story({ id }: { id: string }) {
  let bundle;
  try {
    [bundle] = await getCaseRepository().getBundles([id]);
  } catch (err) {
    return (
      <Band>
        <p role="alert" className="mt-10 text-lg text-danger">
          {err instanceof CorpusError ? "The historical collection could not be loaded right now. Please try again." : "Something went wrong while loading this story."}
        </p>
      </Band>
    );
  }
  if (!bundle) {
    return (
      <Band>
        <h1 className="display mt-12 text-[clamp(3rem,7vw,5.5rem)] leading-none text-ink italic">Story not found</h1>
        <p className="mt-5 text-ink-soft">
          There is no approved case with that reference.{" "}
          <Link href="/" className="font-semibold text-ink underline decoration-accent/50 decoration-1 underline-offset-[5px] hover:decoration-ink">
            Start a new analysis
          </Link>
          .
        </p>
      </Band>
    );
  }

  const story = toCaseStory(bundle);
  const evidence = evidenceViews([bundle]);
  const refs = claimNumbers(story);
  const lesson = story.lesson.text || story.pattern;
  const when = story.year_start !== null && story.year_end !== null && story.year_end !== story.year_start ? `${formatYear(story.year_start)}–${formatYear(story.year_end)}` : formatYear(story.year_start);
  const n = (() => {
    let i = 0;
    return () => String(++i).padStart(2, "0");
  })();

  return (
    <>
      <Band>
        <header className="mt-12 sm:mt-20">
          <p className="stagger flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
            {when ? <Tag>{when}</Tag> : null}
            <span>
              {story.date_detail}
              {story.geography ? ` · ${story.geography}` : ""}
            </span>
          </p>
          <h1 className="display stagger mt-7 max-w-6xl text-[clamp(2.8rem,7.4vw,7rem)] leading-[0.92] tracking-[-0.04em] text-balance text-ink [--d:100]">{story.title}</h1>
          <p className="stagger mt-8 ml-auto max-w-2xl border-l border-accent pl-6 text-[clamp(1.15rem,1.7vw,1.45rem)] leading-snug text-ink-soft [--d:220] lg:mr-[8%]">{story.decision_question}</p>
        </header>
      </Band>

      <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 pt-14 pb-16 sm:px-10 sm:pt-20">
        <div className="grid gap-14 lg:grid-cols-12 lg:gap-16">
          <div className="min-w-0 space-y-20 lg:col-span-8">
            <Section index={n()} title="The situation">
              <p className="text-[1.125rem] leading-[1.8] text-ink">
                {story.context.text}
                <Refs ids={story.context.claim_ids} refs={refs} />
              </p>
              {story.available_information.length ? (
                <div className="mt-6">
                  <Label>What they knew, and did not know</Label>
                  <BulletList items={story.available_information} className="text-ink-soft" />
                </div>
              ) : null}
            </Section>

            {story.options.length ? (
              <Section index={n()} title="The choice" aside={story.options_are_editorial ? "Options framed by the editors" : null}>
                <ol>
                  {story.options.map((o, i) => (
                    <li key={o} className="flex gap-6 border-b border-rule-soft py-5">
                      <span className="display w-7 shrink-0 text-[1.9rem] leading-[0.9] text-accent-ink italic">{String.fromCharCode(65 + i)}</span>
                      <span className="text-[1.05rem] leading-relaxed text-ink">{o}</span>
                    </li>
                  ))}
                </ol>
              </Section>
            ) : null}

            <section aria-labelledby={sectionId("What they did")} className="rounded-[6px] bg-night p-7 text-white sm:p-14 lg:-mr-12">
              <h2 id={sectionId("What they did")} className="eyebrow flex items-baseline gap-4 text-accent">
                <span className="tabular-nums">{n()}</span>What they did
              </h2>
              <p className="display mt-7 text-[clamp(1.7rem,3vw,2.6rem)] leading-[1.15]">
                {story.chosen_action.text}
                <Refs ids={story.chosen_action.claim_ids} refs={refs} dark />
              </p>
            </section>

            <Section index={n()} title="What happened">
              <p className="text-[1.125rem] leading-[1.8] text-ink">
                {story.outcome.text}
                <Refs ids={story.outcome.claim_ids} refs={refs} />
              </p>
              {story.outcome.uncertainty ? <p className="mt-4 text-sm text-muted italic">{story.outcome.uncertainty}</p> : null}
            </Section>

            {lesson ? (
              <Section index={n()} title="The lesson" aside={<Tag>Interpretation</Tag>}>
                <p className="display border-l-2 border-accent bg-highlight-wash px-7 py-6 text-[clamp(1.4rem,2.2vw,1.8rem)] leading-[1.3] text-ink italic">{lesson}</p>
                {story.lesson.conditions.length ? (
                  <div className="mt-6">
                    <Label>It holds when</Label>
                    <BulletList items={story.lesson.conditions} className="text-ink-soft" />
                  </div>
                ) : null}
              </Section>
            ) : null}

            {story.analogy_limits.length ? (
              <Section index={n()} title="Where the comparison stops">
                <BulletList items={story.analogy_limits} className="text-ink-soft" />
              </Section>
            ) : null}

            <Section index={n()} title="From the record">
              <CaseEvidence card={story} claims={evidence.claims} passages={evidence.passages} sources={evidence.sources} refs={refs} />
            </Section>
          </div>

          <aside className="self-start overflow-hidden rounded-[6px] border border-rule-soft bg-card lg:sticky lg:top-8 lg:col-span-4 lg:ml-6">
            <p className="display px-6 pt-7 pb-5 text-[1.6rem] leading-none italic">At a glance</p>
            <dl className="text-sm">
              <Fact label="When">{when}</Fact>
              {story.geography ? <Fact label="Where">{story.geography}</Fact> : null}
              {story.actors.length ? <Fact label="Who decided">{story.actors.join(", ")}</Fact> : null}
              {story.goals.length ? <Fact label="Aims">{story.goals.join("; ")}</Fact> : null}
              {story.constraints.length ? <Fact label="Constraints">{story.constraints.join("; ")}</Fact> : null}
              {story.time_pressure ? <Fact label="Time pressure">{story.time_pressure}</Fact> : null}
              {story.reversibility ? <Fact label="Could it be undone?">{story.reversibility}</Fact> : null}
              <Fact label="Sources">
                {evidence.sources.length} {evidence.sources.length === 1 ? "source" : "sources"}, {evidence.passages.length} quoted passages
              </Fact>
            </dl>
          </aside>
        </div>
      </main>
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.75rem_1fr] gap-3 border-t border-rule-soft px-6 py-4">
      <dt className="eyebrow pt-[0.3em] text-[0.62rem] text-muted">{label}</dt>
      <dd className="leading-relaxed text-ink">{children}</dd>
    </div>
  );
}
