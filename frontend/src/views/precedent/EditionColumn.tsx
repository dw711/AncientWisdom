import { useRef } from 'react'
import type { Path } from '../../data/types'
import { gsap, MOTION_OK, useGSAP } from '../../lib/gsap'
import Avatar from '../../components/Avatar'
import EventChips from '../../components/EventChips'
import FitBars from './FitBars'

interface Props {
  path: Path
  edition: string // "A", "B"…
  color: string
  sectionId: string
  delay?: number
}

/** One newspaper column. It "prints" story by story when it scrolls into view. */
export default function EditionColumn({ path, edition, color, sectionId, delay = 0 }: Props) {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        gsap
          .timeline({ delay, scrollTrigger: { trigger: root.current, start: 'top 78%' } })
          .fromTo('[data-bar]', { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.6, ease: 'power3.inOut' })
          .fromTo('[data-byline]', { opacity: 0 }, { opacity: 1, duration: 0.4 }, '-=0.15')
          .fromTo(
            '[data-story]',
            { clipPath: 'inset(0 0 100% 0)', y: -6 },
            { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 0.85, ease: 'power2.inOut', stagger: 0.32 },
            '-=0.1',
          )
          .fromTo('[data-press-rule]', { scaleX: 0 }, { scaleX: 1, transformOrigin: '0 50%', duration: 0.5, stagger: 0.32 }, '<0.3')
      })
    },
    { scope: root, dependencies: [path], revertOnUpdate: true },
  )

  return (
    <section ref={root} id={sectionId} aria-labelledby={`${sectionId}-h`} className="min-w-0 scroll-mt-20">
      <h2
        id={`${sectionId}-h`}
        data-bar
        className="label font-fragment flex items-center justify-between px-3 py-2 text-[12px] text-newsprint"
        style={{ background: color }}
      >
        <span>
          Edition {edition} — {path.kicker}
        </span>
        <span>{path.figure}</span>
      </h2>
      <p data-byline className="flex items-center gap-3 border-b border-press py-3">
        <Avatar initials={path.initials} color={color} size={40} />
        <span className="font-sourceserif text-[15px] italic leading-snug text-press">
          The life of <strong className="font-semibold not-italic">{path.figure}</strong>, who at {path.age} in {path.year}{' '}
          chose to {path.label.toLowerCase()}.
        </span>
      </p>

      <ol>
        {path.events.map((e, i) => (
          <li key={i} className="relative">
            <article
              data-story
              tabIndex={0}
              aria-labelledby={`${sectionId}-s${i}`}
              className="py-6 outline-offset-4 focus-visible:outline-2"
              style={{ outlineColor: color }}
            >
              <p className="label font-fragment mb-2 flex flex-wrap gap-x-3 text-press/70">
                <span style={{ color }}>No. {String(i + 1).padStart(2, '0')}</span>
                <span>{e.date}</span>
                {e.yearsLater !== null && <span>+{e.yearsLater} yrs</span>}
              </p>
              <h3
                id={`${sectionId}-s${i}`}
                className={`font-editorial font-black tracking-[-0.02em] text-press ${
                  i === 0 ? 'text-[38px] leading-[1.02] md:text-[48px]' : 'text-[26px] leading-[1.1]'
                }`}
              >
                {e.title}
              </h3>
              <p
                className={`mt-3 font-sourceserif text-[17px] leading-[1.55] text-press/90 ${
                  i === 0
                    ? 'first-letter:float-left first-letter:mr-1.5 first-letter:mt-1 first-letter:font-editorial first-letter:text-[3.6em] first-letter:font-black first-letter:leading-[0.8]'
                    : ''
                }`}
              >
                {e.body}
              </p>
              <div className="mt-3">
                <EventChips event={e} className="font-fragment text-[10px] uppercase tracking-[1px] text-press/75 border-press/40" />
              </div>
            </article>
            {i < path.events.length - 1 && <hr data-press-rule className="border-0 border-t border-press/35" />}
          </li>
        ))}
      </ol>

      <FitBars fit={path.fit} color={color} id={sectionId} />
    </section>
  )
}
