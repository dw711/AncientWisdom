import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { BackLink } from "@/components/back-link";
import { CaseEvidence } from "@/components/evidence-list";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { BulletList, Label, SectionHeading, Tag } from "@/components/ui";
import { claimNumbers, formatYear } from "@/lib/case-refs";
import { CorpusError, getCaseRepository } from "@/lib/server/corpus";
import { evidenceViews, toCaseStory } from "@/lib/server/corpus/views";

export const metadata: Metadata = {
  title: "The full story · The Precedent",
  description: "The full story of a historical decision: the situation, the choice, what happened, and the sources.",
};

export default function CasePage({ params }: PageProps<"/cases/[id]">) {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-10 pb-24 md:px-10">
        <BackLink />
        <Suspense fallback={<StorySkeleton />}>{params.then(({ id }) => <Story id={decodeURIComponent(id)} />)}</Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}

function StorySkeleton() {
  return (
    <div className="mt-10 animate-pulse space-y-4" aria-busy="true" aria-label="Loading the story">
      <div className="h-4 w-40 bg-paper-deep" />
      <div className="h-10 w-3/4 bg-paper-deep" />
      <div className="h-4 w-2/3 bg-paper-deep" />
    </div>
  );
}

function Refs({ ids, refs }: { ids: string[]; refs: Record<string, number> }) {
  if (!ids.length) return null;
  return (
    <span className="ml-0.5 align-super text-[0.7rem] leading-none">
      {ids.map((id) => (
        <a key={id} href={`#claim-${id}`} className="px-0.5 font-mono text-[0.66rem] text-muted hover:bg-ink hover:text-paper" aria-label={`Source passage ${refs[id]}`}>
          [{refs[id]}]
        </a>
      ))}
    </span>
  );
}

function Section({ numeral, title, aside, children }: { numeral: string; title: string; aside?: ReactNode; children: ReactNode }) {
  const id = `story-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id}>
      <SectionHeading id={id} numeral={numeral} title={title} aside={aside} />
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
      <p role="alert" className="mt-10 text-burgundy">
        {err instanceof CorpusError ? "The historical collection could not be loaded right now. Please try again." : "Something went wrong while loading this story."}
      </p>
    );
  }
  if (!bundle) {
    return (
      <div className="mt-10 space-y-3">
        <h1 className="font-display text-4xl font-black tracking-[-0.02em] text-ink">Story not found</h1>
        <p className="text-ink-soft">
          There is no approved case with that reference. <Link href="/" className="text-burgundy underline underline-offset-4">Start a new analysis</Link>.
        </p>
      </div>
    );
  }

  const story = toCaseStory(bundle);
  const evidence = evidenceViews([bundle]);
  const refs = claimNumbers(story);
  const lesson = story.lesson.text || story.pattern;
  const when = story.year_start !== null && story.year_end !== null && story.year_end !== story.year_start ? `${formatYear(story.year_start)}–${formatYear(story.year_end)}` : formatYear(story.year_start);

  return (
    <article className="animate-rise">
      <header className="mt-8 max-w-3xl">
        <p className="label text-burgundy">
          {story.date_detail}
          {story.geography ? ` · ${story.geography}` : ""}
        </p>
        <h1 className="mt-2 font-display text-[2.4rem] leading-[1.02] font-black tracking-[-0.02em] text-ink sm:text-[3.2rem]">{story.title}</h1>
        <p className="mt-4 font-display text-[1.4rem] leading-snug text-ink-soft italic">“{story.decision_question}”</p>
      </header>

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-12">
          <Section numeral="I" title="The situation">
            <p className="text-[1.05rem] leading-relaxed text-ink">
              {story.context.text}
              <Refs ids={story.context.claim_ids} refs={refs} />
            </p>
            {story.available_information.length ? (
              <div className="mt-5">
                <Label>What they knew, and did not know</Label>
                <BulletList items={story.available_information} className="text-ink-soft" />
              </div>
            ) : null}
          </Section>

          {story.options.length ? (
            <Section numeral="II" title="The choice" aside={story.options_are_editorial ? "Options framed by the editors" : null}>
              <ol className="space-y-2">
                {story.options.map((o, i) => (
                  <li key={o} className="flex gap-4 border-b border-ink/25 py-3">
                    <span className="font-display text-2xl leading-none font-black text-burgundy">{String.fromCharCode(65 + i)}</span>
                    <span className="leading-relaxed text-ink">{o}</span>
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}

          <Section numeral="III" title="What they did">
            <p className="border-l-2 border-burgundy pl-5 font-display text-[1.4rem] leading-snug text-ink italic">
              {story.chosen_action.text}
              <Refs ids={story.chosen_action.claim_ids} refs={refs} />
            </p>
          </Section>

          <Section numeral="IV" title="What happened">
            <p className="text-[1.05rem] leading-relaxed text-ink">
              {story.outcome.text}
              <Refs ids={story.outcome.claim_ids} refs={refs} />
            </p>
            {story.outcome.uncertainty ? <p className="mt-3 text-sm text-muted">{story.outcome.uncertainty}</p> : null}
          </Section>

          {lesson ? (
            <Section numeral="V" title="The lesson" aside={<Tag tone="bronze">Interpretation</Tag>}>
              <p className="border-y border-ink py-4 text-[1.15rem] leading-relaxed text-ink italic">{lesson}</p>
              {story.lesson.conditions.length ? (
                <div className="mt-4">
                  <Label>It holds when</Label>
                  <BulletList items={story.lesson.conditions} className="text-ink-soft" />
                </div>
              ) : null}
            </Section>
          ) : null}

          {story.analogy_limits.length ? (
            <Section numeral="VI" title="Where the comparison stops">
              <BulletList items={story.analogy_limits} className="text-ink-soft" />
            </Section>
          ) : null}

          <Section numeral="VII" title="From the record">
            <CaseEvidence card={story} claims={evidence.claims} passages={evidence.passages} sources={evidence.sources} refs={refs} />
          </Section>
        </div>

        <aside className="self-start border-t-[3px] border-ink pt-3 text-sm lg:sticky lg:top-20">
          <p className="label text-burgundy">At a glance</p>
          <dl className="mt-3 divide-y divide-ink/20">
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
    </article>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-2.5">
      <dt className="label text-muted">{label}</dt>
      <dd className="mt-0.5 leading-relaxed text-ink-soft">{children}</dd>
    </div>
  );
}
