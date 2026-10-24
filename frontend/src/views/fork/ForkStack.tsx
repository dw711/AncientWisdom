import { useRef } from 'react'
import type { Path } from '../../data/types'
import { fractionOf, yearsLaterAt } from '../../data/normalize'
import { gsap, MOTION_OK, useGSAP } from '../../lib/gsap'
import Avatar from '../../components/Avatar'
import EventChips from '../../components/EventChips'
import Odometer from './Odometer'
import { isHighlighted, opacityFor, type Focus } from './focus'

interface Props {
  paths: Path[]
  focus: Focus | null
  handleT: number
  onHover: (f: Focus | null) => void
  onHandle: (t: number) => void
}

/** Small-screen fork: the trunk splits into two stacked vertical paths. */
export default function ForkStack({ paths, focus, handleT, onHover, onHandle }: Props) {
  const root = useRef<HTMLElement>(null)
  const steps = Math.max(...paths.map((p) => p.events.length)) - 1

  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        gsap.utils.toArray<HTMLElement>('[data-stack-line]').forEach((el) => {
          gsap.fromTo(
            el,
            { scaleY: 0, transformOrigin: '50% 0%' },
            { scaleY: 1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 70%', end: 'bottom 70%', scrub: 0.5 } },
          )
        })
        gsap.utils.toArray<HTMLElement>('[data-stack-card]').forEach((el) => {
          gsap.fromTo(
            el,
            { opacity: 0, y: 24 },
            { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 85%' } },
          )
          gsap.fromTo(
            el.querySelectorAll('.odo-strip'),
            { y: 0, yPercent: 0 },
            {
              yPercent: (_i: number, s: HTMLElement) => -10 * Number(s.dataset.digit),
              duration: 0.8,
              stagger: 0.1,
              ease: 'power2.out',
              scrollTrigger: { trigger: el, start: 'top 85%' },
            },
          )
        })
      })
    },
    { scope: root, dependencies: [paths], revertOnUpdate: true },
  )

  return (
    <section ref={root} aria-labelledby="fork-stack-title" className="px-4 pb-20">
      <h2 id="fork-stack-title" className="label font-plex mb-6 flex items-center gap-3">
        <span>You, now</span>
        <span aria-hidden className="h-px flex-1 bg-ink" />
        <span className="grid size-4 place-items-center rounded-full border-[1.5px] border-ink" aria-hidden />
        <span>The fork</span>
      </h2>

      <div className="sticky top-[96px] z-30 mb-8 rounded-full border border-ink bg-cream px-4 py-2">
        <label className="label font-plex flex items-center gap-3">
          <span className="shrink-0">Years later</span>
          <input
            type="range"
            min={0}
            max={steps}
            step={1}
            value={Math.round(handleT * steps)}
            onChange={(e) => onHandle(Number(e.target.value) / steps)}
            aria-valuetext={paths.map((p) => `${p.surname} ${yearsLaterAt(p, handleT)} years later`).join(', ')}
            className="w-full accent-ink"
          />
          {paths.map((p) => (
            <span key={p.id} className="shrink-0 tabular-nums" style={{ color: p.color }}>
              +{yearsLaterAt(p, handleT)}
            </span>
          ))}
        </label>
      </div>

      {paths.map((p) => (
        <div key={p.id} className="mb-14" style={{ opacity: opacityFor(focus, p), transition: 'opacity .35s' }}>
          <div className="mb-6 flex items-center gap-3">
            <Avatar initials={p.initials} color={p.color} size={48} />
            <div>
              <p className="label font-plex" style={{ color: p.color }}>
                Path {p.id} · {p.label}
              </p>
              <p className="font-playfair text-2xl text-ink">{p.figure}</p>
              <p className="label font-plex text-ink/60">
                Aged {p.age} · {p.year}
              </p>
            </div>
          </div>
          <ol className="relative ml-[23px] border-l-0 pl-8">
            <span data-stack-line aria-hidden className="absolute bottom-0 left-0 top-0 w-[2px]" style={{ background: p.color }} />
            {p.events.map((e, i) => {
              const hi = isHighlighted(focus, p, i)
              return (
                <li key={i} className="relative mb-5 last:mb-0">
                  <span
                    aria-hidden
                    className="absolute -left-[39px] top-4 size-4 rounded-full border-2 transition-colors"
                    style={{ borderColor: p.color, background: hi ? p.color : '#F2EDE4' }}
                  />
                  <article
                    data-stack-card
                    data-jump={`${p.id}-${i}`}
                    tabIndex={0}
                    onFocus={() => onHover({ source: p.id, t: fractionOf(p, i) })}
                    onBlur={() => onHover(null)}
                    className="border bg-cream p-4 transition-colors"
                    style={{ borderColor: hi ? p.color : 'rgba(20,18,15,.16)' }}
                  >
                    <p className="label font-plex flex justify-between" style={{ color: p.color }}>
                      <Odometer value={e.date} />
                      {e.yearsLater !== null && <span className="text-ink/45">+{e.yearsLater} yrs</span>}
                    </p>
                    <h3 className="mt-1 font-playfair text-xl text-ink">{e.title}</h3>
                    <p className="mt-1 font-inter text-[14px] leading-relaxed text-ink/80">{e.body}</p>
                    <div className="mt-3">
                      <EventChips event={e} className="font-plex text-[10px] uppercase tracking-[1px] text-ink/70 border-ink/25" />
                    </div>
                  </article>
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </section>
  )
}
