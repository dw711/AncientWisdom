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
      <div className="mx-auto max-w-[90rem] px-4 pt-4 pb-14 sm:px-10 sm:pt-8 sm:pb-20">
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
        <div className="h-5 w-48 rounded bg-paper-deep" />
        <div className="h-16 w-3/4 rounded bg-paper-deep" />
        <div className="h-5 w-2/3 rounded bg-paper-deep" />
      </div>
    </Band>
  );
}

function Refs({ ids, refs, dark }: { ids: string[]; refs: Record<string, number>; dark?: boolean }) {
  if (!ids.length) return null;
  return (
    <span className="ml-0.5 align-super text-[0.7rem] leading-none font-medium tracking-normal">
      {ids.map((id) => (
        <a
          key={id}
          href={`#claim-${id}`}
          className={cx("rounded-sm px-0.5", dark ? "text-white/60 hover:bg-white hover:text-ink" : "text-ink/60 hover:bg-highlight hover:text-ink")}
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
        <p role="alert" className="mt-10 text-lg text-accent-ink">
          {err instanceof CorpusError ? "The historical collection could not be loaded right now. Please try again." : "Something went wrong while loading this story."}
        </p>
      </Band>
    );
  }
  if (!bundle) {
    return (
      <Band>
        <h1 className="mt-10 text-[clamp(2.4rem,5vw,4rem)] leading-none font-semibold tracking-[-0.045em] text-ink">Story not found</h1>
        <p className="mt-4 font-light text-ink-soft">
          There is no approved case with that reference.{" "}
          <Link href="/" className="font-medium text-ink underline decoration-ink/25 decoration-[1.5px] underline-offset-4 hover:decoration-ink">
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
        <header className="mt-10 animate-rise sm:mt-14">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-light text-ink-soft">
            {when ? <Tag>{when}</Tag> : null}
            <span>
              {story.date_detail}
              {story.geography ? ` · ${story.geography}` : ""}
            </span>
          </p>
          <h1 className="mt-5 max-w-6xl text-[clamp(2.4rem,6vw,5.5rem)] leading-[0.95] font-semibold tracking-[-0.05em] text-balance text-ink">{story.title}</h1>
          <p className="mt-6 max-w-3xl text-[clamp(1.15rem,1.7vw,1.4rem)] leading-snug font-light text-ink">{story.decision_question}</p>
        </header>
      </Band>

      <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 pt-12 pb-16 sm:px-10 sm:pt-16">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-16">
          <div className="min-w-0 space-y-16">
            <Section index={n()} title="The situation">
              <p className="text-[1.1rem] leading-[1.75] font-light text-ink">
                {story.context.text}
                <Refs ids={story.context.claim_ids} refs={refs} />
              </p>
              {story.available_information.length ? (
                <div className="mt-6">
                  <Label>What they knew, and did not know</Label>
                  <BulletList items={story.available_information} className="font-light text-ink-soft" />
                </div>
              ) : null}
            </Section>

            {story.options.length ? (
              <Section index={n()} title="The choice" aside={story.options_are_editorial ? "Options framed by the editors" : null}>
                <ol>
                  {story.options.map((o, i) => (
                    <li key={o} className="dots-b flex gap-5 py-4">
                      <span className="w-6 shrink-0 text-xl leading-none font-semibold tracking-[-0.03em]">{String.fromCharCode(65 + i)}</span>
                      <span className="leading-relaxed font-light text-ink">{o}</span>
                    </li>
                  ))}
                </ol>
              </Section>
            ) : null}

            <section aria-labelledby={sectionId("What they did")} className="rounded-2xl bg-night p-6 text-white sm:p-10">
              <h2 id={sectionId("What they did")} className="flex items-baseline gap-3 text-sm font-light text-white/60">
                <span className="tabular-nums">{n()}</span>What they did
              </h2>
              <p className="mt-5 text-[clamp(1.4rem,2.5vw,2.1rem)] leading-[1.18] font-semibold tracking-[-0.03em]">
                {story.chosen_action.text}
                <Refs ids={story.chosen_action.claim_ids} refs={refs} dark />
              </p>
            </section>

            <Section index={n()} title="What happened">
              <p className="text-[1.1rem] leading-[1.75] font-light text-ink">
                {story.outcome.text}
                <Refs ids={story.outcome.claim_ids} refs={refs} />
              </p>
              {story.outcome.uncertainty ? <p className="mt-3 text-sm font-light text-muted">{story.outcome.uncertainty}</p> : null}
            </Section>

            {lesson ? (
              <Section index={n()} title="The lesson" aside={<Tag>Interpretation</Tag>}>
                <p className="rounded-xl bg-highlight-wash px-6 py-5 text-[1.2rem] leading-relaxed font-medium tracking-[-0.015em] text-ink">{lesson}</p>
                {story.lesson.conditions.length ? (
                  <div className="mt-6">
                    <Label>It holds when</Label>
                    <BulletList items={story.lesson.conditions} className="font-light text-ink-soft" />
                  </div>
                ) : null}
              </Section>
            ) : null}

            {story.analogy_limits.length ? (
              <Section index={n()} title="Where the comparison stops">
                <BulletList items={story.analogy_limits} className="font-light text-ink-soft" />
              </Section>
            ) : null}

            <Section index={n()} title="From the record">
              <CaseEvidence card={story} claims={evidence.claims} passages={evidence.passages} sources={evidence.sources} refs={refs} />
            </Section>
          </div>

          <aside className="self-start overflow-hidden rounded-2xl bg-card lg:sticky lg:top-6">
            <p className="px-6 pt-6 pb-4 text-lg font-semibold tracking-[-0.02em]">At a glance</p>
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
    <div className="grid grid-cols-[6.75rem_1fr] gap-3 border-t border-rule-soft px-6 py-3.5">
      <dt className="font-semibold text-ink">{label}</dt>
      <dd className="leading-relaxed font-light text-ink-soft">{children}</dd>
    </div>
  );
}
