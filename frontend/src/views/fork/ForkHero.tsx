import { useRef } from 'react'
import type { MirrorView } from '../../data/types'
import { gsap, MOTION_OK, useGSAP } from '../../lib/gsap'

export default function ForkHero({ data }: { data: MirrorView }) {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        gsap
          .timeline({ defaults: { ease: 'power3.out' } })
          .from('[data-hero-word]', { yPercent: 110, opacity: 0, duration: 0.9, stagger: 0.025 })
          .from('[data-hero-shape]', { x: 16, opacity: 0, duration: 0.6, stagger: 0.08 }, 0.35)
          .from('[data-hero-cue]', { opacity: 0, duration: 0.6 }, '-=0.2')
      })
    },
    { scope: root, dependencies: [data.dilemma], revertOnUpdate: true },
  )

  const words = data.dilemma.split(/\s+/)

  return (
    <section ref={root} aria-labelledby="fork-title" className="mx-auto max-w-[1440px] px-4 pb-16 pt-14 md:px-12 md:pb-24 md:pt-24">
      <h1 id="fork-title" className="sr-only">
        The Fork: two historical lives for your dilemma
      </h1>
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
        <figure className="lg:col-span-8">
          <figcaption className="label font-plex mb-6 text-ink/60">Your dilemma</figcaption>
          <blockquote className="max-w-[22ch] font-playfair text-[32px] italic leading-[1.15] text-ink md:text-[44px]">
            <p>
              <span aria-hidden className="-ml-[0.45em] mr-[0.05em]">“</span>
              {words.map((w, i) => (
                <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
                  <span data-hero-word className="inline-block">
                    {w}
                    {i === words.length - 1 ? '”' : ' '}
                  </span>
                </span>
              ))}
            </p>
          </blockquote>
        </figure>

        <aside aria-labelledby="shape-title" className="border-t border-ink pt-4 lg:col-span-4 lg:mt-12">
          <h2 id="shape-title" className="label font-plex mb-4">
            The shape of it
          </h2>
          <ol className="divide-y divide-ink/15">
            {data.shape.map((s, i) => (
              <li key={s} data-hero-shape className="flex items-baseline gap-4 py-3">
                <span className="label font-plex text-ink/50">{String(i + 1).padStart(2, '0')}</span>
                <span className="font-inter text-[16px] text-ink">{s}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 font-inter text-[13px] leading-relaxed text-ink/60">
            Matched to history on these, not on topic. One life per option.
          </p>
        </aside>
      </div>

      <p data-hero-cue className="label font-plex mt-16 flex items-center gap-3 text-ink/70">
        <span aria-hidden className="inline-block h-px w-10 bg-ink" />
        Scroll to walk both paths
        <span aria-hidden>↓</span>
      </p>
    </section>
  )
}
