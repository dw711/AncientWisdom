import { useEffect, useState, type RefObject } from 'react'
import { ScrollTrigger } from '../../lib/gsap'

export interface NavSection {
  id: string
  label: string
}

/**
 * Sits open above the dateline at the top of the page; once the masthead
 * scrolls away it docks into a compact dark pill showing the current section.
 */
export default function FloatingNav({ sections, mastRef }: { sections: NavSection[]; mastRef: RefObject<HTMLElement | null> }) {
  const [docked, setDocked] = useState(false)
  const [active, setActive] = useState(sections[0]?.id)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const triggers = [
      ScrollTrigger.create({
        trigger: mastRef.current,
        start: 'bottom top+=40',
        onToggle: (self) => setDocked(self.isActive),
        end: () => `+=${document.documentElement.scrollHeight}`,
      }),
      ScrollTrigger.create({
        start: 0,
        end: 'max',
        onUpdate: (self) => setProgress(self.progress),
      }),
      ...sections.map((s) =>
        ScrollTrigger.create({
          trigger: `#${s.id}`,
          start: 'top 45%',
          end: 'bottom 45%',
          onToggle: (self) => self.isActive && setActive(s.id),
        }),
      ),
    ]
    return () => triggers.forEach((t) => t.kill())
  }, [sections, mastRef])

  const current = sections.find((s) => s.id === active)

  return (
    <nav
      aria-label="Sections"
      className={`label font-fragment fixed left-1/2 top-3 z-50 -translate-x-1/2 transition-all duration-500 ${
        docked
          ? 'rounded-full bg-press px-2 py-1.5 text-newsprint shadow-[0_8px_24px_-8px_rgba(0,0,0,.45)]'
          : 'rounded-none border-y border-press/30 bg-newsprint/90 px-2 py-1 text-press'
      }`}
    >
      <div className="flex items-center gap-1">
        <a
          href="#top"
          className={`overflow-hidden whitespace-nowrap font-editorial text-[17px] font-black normal-case tracking-[-0.02em] transition-all duration-500 ${
            docked ? 'max-w-[160px] px-3 opacity-100' : 'max-w-0 px-0 opacity-0'
          }`}
          tabIndex={docked ? 0 : -1}
        >
          The Precedent
        </a>
        {docked && current && (
          <span className="hidden whitespace-nowrap border-l border-newsprint/30 px-3 text-newsprint/60 md:inline" aria-live="polite">
            Now reading: {current.label}
          </span>
        )}
        <ul className={`flex items-center ${docked ? 'max-md:hidden' : ''}`}>
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={active === s.id ? 'location' : undefined}
                className={`block whitespace-nowrap rounded-full px-3 py-1.5 transition-colors ${
                  active === s.id ? (docked ? 'bg-newsprint text-press' : 'underline underline-offset-4') : 'hover:opacity-70'
                }`}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
      {docked && (
        <span aria-hidden className="absolute inset-x-5 -bottom-[1px] h-[2px] origin-left bg-press-red" style={{ transform: `scaleX(${progress})` }} />
      )}
    </nav>
  )
}
