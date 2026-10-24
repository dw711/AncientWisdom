import type { Moment } from '../data/types'
import { shortSource } from '../data/normalize'

/**
 * Type + source chips for one event. Styling is inherited (font, colour) so
 * each view can theme them; `className` is applied to every chip.
 */
export default function EventChips({ event, className = '' }: { event: Moment; className?: string }) {
  const chip = `inline-flex items-center gap-1 rounded-full border px-2 py-[3px] leading-none ${className}`
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Evidence">
      <li>
        <span
          className={`${chip} ${event.type === 'interpretation' ? 'border-dashed' : ''}`}
          title={
            event.type === 'interpretation'
              ? 'Interpretation: a reading of what happened, not a recorded fact'
              : 'Observation: a sourced statement of what happened'
          }
        >
          <span aria-hidden>{event.type === 'interpretation' ? '◇' : '●'}</span>
          {event.type}
        </span>
      </li>
      {event.sources.map((src, i) => (
        <li key={src}>
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className={`${chip} hover:bg-current/10`}
            title={shortSource(src)}
            onClick={(e) => e.stopPropagation()}
          >
            src {event.sources.length > 1 ? i + 1 : ''}
            <span aria-hidden>↗</span>
            <span className="sr-only">{shortSource(src)}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}
