import type { Path } from '../../data/types'
import { fractionOf } from '../../data/normalize'
import { isHighlighted, type Focus } from './focus'

interface Props {
  paths: Path[]
  revealed: number[]
  focus: Focus | null
  onHover: (f: Focus | null) => void
  onJump: (pathId: string, index: number) => void
}

/**
 * Compact year strip pinned under the top bar; hover or focus expands a panel
 * with each event's title. Years go from faint to ink as the line reaches them.
 */
export default function YearIndex({ paths, revealed, focus, onHover, onJump }: Props) {
  const item = (p: Path, i: number) => ({
    onClick: () => onJump(p.id, i),
    onMouseEnter: () => onHover({ source: p.id, t: fractionOf(p, i) }),
    onMouseLeave: () => onHover(null),
    onFocus: () => onHover({ source: p.id, t: fractionOf(p, i) }),
    onBlur: () => onHover(null),
  })

  return (
    <nav
      aria-label="Year index"
      className="group sticky top-[52px] z-40 h-9 border-b border-ink/20 bg-cream/95 backdrop-blur-sm"
    >
      <div className="mx-auto flex h-full max-w-[1440px] items-center gap-6 overflow-x-auto px-4 md:px-12">
        <span className="label font-plex shrink-0 text-ink/50">Index</span>
        {paths.map((p, k) => (
          <ol key={p.id} className="flex shrink-0 items-center gap-3" aria-label={`Path ${p.id}, ${p.figure}`}>
            <span aria-hidden className="label font-plex flex items-center gap-1.5" style={{ color: p.color }}>
              <span className="size-2 rounded-full" style={{ background: p.color }} />
              {p.id}
            </span>
            {p.events.map((e, i) => {
              const reached = i < (revealed[k] ?? 0)
              const hi = isHighlighted(focus, p, i)
              return (
                <li key={i}>
                  <button
                    type="button"
                    {...item(p, i)}
                    aria-label={`${e.date}: ${e.title}`}
                    className="label font-plex block tabular-nums transition-colors duration-300"
                    style={{
                      color: hi ? p.color : reached ? '#14120F' : 'rgba(20,18,15,.32)',
                      textDecoration: hi ? 'underline' : undefined,
                      textUnderlineOffset: 4,
                    }}
                  >
                    {e.year ?? e.date}
                  </button>
                </li>
              )
            })}
          </ol>
        ))}
        <span className="label font-plex ml-auto hidden shrink-0 text-ink/40 lg:inline">Hover to expand</span>
      </div>

      {/* expanded panel: overlays the page so nothing below shifts */}
      <div className="invisible absolute inset-x-0 top-full grid grid-rows-[0fr] border-b border-ink bg-cream opacity-0 transition-all duration-300 group-focus-within:visible group-focus-within:grid-rows-[1fr] group-focus-within:opacity-100 group-hover:visible group-hover:grid-rows-[1fr] group-hover:opacity-100">
        <div className="overflow-hidden">
          <div className="mx-auto grid max-w-[1440px] gap-4 px-4 py-4 md:px-12">
            {paths.map((p, k) => (
              <div key={p.id} className="grid grid-cols-[90px_repeat(5,minmax(0,1fr))] items-start gap-3 max-md:grid-cols-2">
                <p className="label font-plex pt-1" style={{ color: p.color }}>
                  {p.surname}
                </p>
                {p.events.map((e, i) => (
                  <button
                    key={i}
                    type="button"
                    tabIndex={-1}
                    {...item(p, i)}
                    className="border-t pt-2 text-left transition-opacity hover:opacity-100"
                    style={{
                      borderColor: isHighlighted(focus, p, i) ? p.color : 'rgba(20,18,15,.15)',
                      opacity: i < (revealed[k] ?? 0) ? 1 : 0.5,
                    }}
                  >
                    <span className="label font-plex block text-ink/60">
                      {e.date} · +{e.yearsLater ?? '?'} yrs
                    </span>
                    <span className="mt-0.5 block font-playfair text-[16px] leading-tight text-ink">{e.title}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </nav>
  )
}
