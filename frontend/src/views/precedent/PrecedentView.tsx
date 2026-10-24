import { useRef, useState } from 'react'
import type { MirrorView } from '../../data/types'
import { gsap, MOTION_OK, useGSAP } from '../../lib/gsap'
import SourcesLine from '../../components/SourcesLine'
import Dateline from './Dateline'
import Masthead from './Masthead'
import FloatingNav, { type NavSection } from './FloatingNav'
import Collage from './Collage'
import EditionColumn from './EditionColumn'

/** Edition colours follow the newsprint palette, not the path colours. */
const EDITION_COLORS = ['#C1272D', '#111111']
const letterOf = (i: number) => String.fromCharCode(65 + i)

export default function PrecedentView({ data }: { data: MirrorView }) {
  const root = useRef<HTMLDivElement>(null)
  const mast = useRef<HTMLElement>(null)
  const [choice, setChoice] = useState<number | null>(null)
  const paths = data.paths

  const sections: NavSection[] = [
    { id: 'letter', label: 'Letter' },
    ...paths.map((_, i) => ({ id: `edition-${letterOf(i).toLowerCase()}`, label: `Edition ${letterOf(i)}` })),
    { id: 'verdict', label: 'Verdict' },
  ]

  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        gsap
          .timeline({ defaults: { ease: 'power4.out' } })
          .from('[data-mast-letter]', { yPercent: -115, rotate: () => gsap.utils.random(-8, 8), duration: 0.9, stagger: 0.045 })
          .from('[data-letter-quote]', { opacity: 0, y: 20, duration: 0.8 }, '-=0.4')
          .from('[data-letter-note]', { opacity: 0, x: 12, duration: 0.6 }, '<0.15')
      })
    },
    { scope: root },
  )

  return (
    <div ref={root} id="top" className="grain relative min-h-svh bg-newsprint pt-14 text-press">
      <FloatingNav sections={sections} mastRef={mast} />

      <main className="mx-auto max-w-[1280px] px-4 md:px-10">
        <Dateline />
        <Masthead ref={mast} />

        {/* Reader's letter */}
        <section id="letter" aria-labelledby="letter-h" className="grid scroll-mt-20 gap-10 border-b border-press py-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-8">
            <h2 id="letter-h" className="label font-fragment mb-5 text-press-red">
              Reader’s letter
            </h2>
            <blockquote data-letter-quote className="font-editorial text-[30px] italic leading-[1.18] md:text-[42px]">
              <p>
                <span aria-hidden className="text-press-red">“</span>
                {data.dilemma}
                <span aria-hidden className="text-press-red">”</span>
              </p>
              <footer className="label font-fragment mt-5 not-italic text-press/60">— Undecided, by letter</footer>
            </blockquote>
          </div>
          <aside data-letter-note className="lg:col-span-4 lg:border-l lg:border-press lg:pl-8">
            <p className="label font-fragment mb-2 text-press/60">Editor’s note</p>
            <p className="max-w-[34ch] font-sourceserif text-[16px] italic leading-snug">
              Matched on stakes, pressure, reversibility and timing, not on topic.
            </p>
            <ul className="label font-fragment mt-4 flex flex-wrap gap-1.5">
              {data.shape.map((s) => (
                <li key={s} className="border border-press/50 px-2 py-1">
                  {s}
                </li>
              ))}
            </ul>
            <Collage paths={paths} colors={EDITION_COLORS} />
          </aside>
        </section>

        {/* The two editions */}
        <div className={`grid gap-12 py-10 md:gap-0 ${paths.length > 1 ? 'md:grid-cols-2' : ''}`}>
          {paths.map((p, i) => (
            <div key={p.id} className={`min-w-0 ${i > 0 ? 'md:border-l md:border-press md:pl-8' : 'md:pr-8'}`}>
              <EditionColumn
                path={p}
                edition={letterOf(i)}
                color={EDITION_COLORS[i % EDITION_COLORS.length]!}
                sectionId={`edition-${letterOf(i).toLowerCase()}`}
                delay={i * 0.25}
              />
            </div>
          ))}
        </div>
      </main>

      <footer id="verdict" aria-labelledby="verdict-h" className="scroll-mt-20 border-t-[6px] border-press">
        <div className="mx-auto max-w-[1280px] px-4 py-16 text-center md:px-10">
          <h2 id="verdict-h" className="mx-auto max-w-[18ch] font-editorial text-[40px] italic leading-[1.05] md:text-[64px]">
            Which edition do you want to wake up in?
          </h2>
          <div role="group" aria-label="Choose an edition" className="mt-8 flex flex-wrap justify-center gap-3">
            {paths.map((p, i) => {
              const c = EDITION_COLORS[i % EDITION_COLORS.length]!
              const on = choice === i
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setChoice(i)}
                  className="label font-fragment border-2 px-7 py-3 transition-colors"
                  style={{ borderColor: c, background: on ? c : 'transparent', color: on ? '#EDEAE2' : c }}
                >
                  Edition {letterOf(i)}
                </button>
              )
            })}
          </div>
          <p aria-live="polite" className="mx-auto mt-8 min-h-[3em] max-w-[56ch] font-sourceserif text-[19px] italic leading-relaxed">
            {choice !== null && paths[choice] && (
              <span key={choice} className="inline-block animate-[fadeUp_.5s_ease-out]">
                {paths[choice].reflection}
              </span>
            )}
          </p>
          <div className="mx-auto mt-12 max-w-[900px] border-t border-press pt-4 font-fragment text-press/70">
            <SourcesLine sources={data.sources} />
          </div>
        </div>
      </footer>
    </div>
  )
}
