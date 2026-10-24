import { useRef, useState } from 'react'
import type { MirrorView } from '../../data/types'
import { gsap, MOTION_OK, useGSAP } from '../../lib/gsap'
import SourcesLine from '../../components/SourcesLine'

export default function ForkEnding({ data }: { data: MirrorView }) {
  const root = useRef<HTMLElement>(null)
  const [choice, setChoice] = useState<string | null>(null)

  const options = [
    ...data.paths.map((p) => ({ id: p.id, label: `${p.surname}’s`, reflection: p.reflection, color: p.color })),
    { id: 'neither', label: 'Neither', reflection: data.neitherReflection, color: '#F2EDE4' },
  ]
  const picked = options.find((o) => o.id === choice)

  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        gsap.from('[data-end-word]', {
          yPercent: 100,
          opacity: 0,
          stagger: 0.05,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: { trigger: root.current, start: 'top 65%' },
        })
        gsap.from('[data-end-pill]', {
          y: 16,
          opacity: 0,
          stagger: 0.08,
          duration: 0.5,
          ease: 'power2.out',
          scrollTrigger: { trigger: root.current, start: 'top 55%' },
        })
      })
    },
    { scope: root },
  )

  const question = 'Whose ten years later would you rather have?'.split(' ')

  return (
    <section ref={root} aria-labelledby="ending-title" className="bg-ink text-cream">
      <div className="mx-auto flex min-h-[80svh] max-w-[1440px] flex-col justify-center px-4 py-24 md:px-12">
        <p className="label font-plex mb-8 text-cream/60">The question that matters</p>
        <h2 id="ending-title" className="max-w-[16ch] font-playfair text-[44px] italic leading-[1.05] md:text-[80px]">
          {question.map((w, i) => (
            <span key={i} className="inline-block overflow-hidden pb-[0.1em] align-bottom">
              <span data-end-word className="inline-block">
                {w}
                {i < question.length - 1 && ' '}
              </span>
            </span>
          ))}
        </h2>

        <div role="group" aria-label="Choose" className="mt-12 flex flex-wrap gap-3">
          {options.map((o) => (
            <button
              key={o.id}
              data-end-pill
              type="button"
              aria-pressed={choice === o.id}
              onClick={() => setChoice(o.id)}
              className="label font-plex flex items-center gap-2 rounded-full border border-cream/70 px-6 py-3 transition-colors hover:bg-cream hover:text-ink aria-pressed:bg-cream aria-pressed:text-ink"
            >
              <span aria-hidden className="size-2 rounded-full" style={{ background: o.color }} />
              {o.label}
            </button>
          ))}
        </div>

        <p aria-live="polite" className="mt-10 min-h-[3.2em] max-w-[52ch] font-inter text-[18px] leading-relaxed text-cream/85">
          {picked && (
            <span key={picked.id} className="inline-block animate-[fadeUp_.5s_ease-out]">
              {picked.reflection}
            </span>
          )}
        </p>
      </div>

      <footer id="method" className="border-t border-cream/15">
        <div className="mx-auto max-w-[1440px] px-4 py-6 font-plex text-cream/60 md:px-12">
          <p className="mb-2 text-[11px] leading-relaxed">
            Method: figures are matched on the shape of the decision (stakes, family pressure, reversibility, timing), not on topic.
            ● observation = sourced fact · ◇ interpretation = a reading of it.
          </p>
          <SourcesLine sources={data.sources} />
        </div>
      </footer>
    </section>
  )
}
