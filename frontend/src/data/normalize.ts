import type { Mirror, MirrorView, Path } from './types'

const yearOf = (date: string): number | null => {
  const m = date.match(/\d{4}/)
  return m ? Number(m[0]) : null
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join('')

/** "familyPressure" -> "Family pressure" */
export const humanise = (key: string) => {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const strongestFit = (fit: Record<string, number>) =>
  Object.entries(fit).sort((a, b) => b[1] - a[1])[0]?.[0]

export function normalize(raw: Mirror): MirrorView {
  const paths: Path[] = raw.paths.map((p) => {
    const surname = p.figure.trim().split(/\s+/).pop() ?? p.figure
    const top = strongestFit(p.fit)
    return {
      ...p,
      surname,
      initials: initialsOf(p.figure),
      kicker: p.kicker ?? p.label,
      reflection:
        p.reflection ??
        `You'd ${p.label.toLowerCase()}${top ? `, and you weigh ${humanise(top).toLowerCase()} above the rest` : ''}.`,
      events: p.events.map((e, index) => {
        const year = yearOf(e.date)
        return {
          ...e,
          index,
          year,
          yearsLater: year === null ? null : year - p.year,
          type: e.type ?? 'observation',
          sources: e.sources ?? [],
        }
      }),
    }
  })

  return {
    dilemma: raw.dilemma,
    shape: raw.shape,
    paths,
    neitherReflection:
      raw.neitherReflection ?? 'Neither, then. What you measured them by is what you value.',
    sources: [...new Set(paths.flatMap((p) => p.events.flatMap((e) => e.sources)))],
  }
}

/**
 * Years later on a path at fraction t (0 = first event, 1 = last), linearly
 * interpolated between events. Paths with different event counts line up by
 * fraction, which is also how "the same point on the other path" is defined.
 */
export function yearsLaterAt(path: Path, t: number): number {
  const known = path.events.map((e) => e.yearsLater ?? 0)
  if (known.length === 1) return known[0]!
  const pos = Math.min(Math.max(t, 0), 1) * (known.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.min(lo + 1, known.length - 1)
  return Math.round(known[lo]! + (known[hi]! - known[lo]!) * (pos - lo))
}

/** Index on `path` nearest to fraction t. */
export const indexAt = (path: Path, t: number) => Math.round(t * (path.events.length - 1))

/** Fraction of event i along its path. */
export const fractionOf = (path: Path, i: number) =>
  path.events.length > 1 ? i / (path.events.length - 1) : 0

export const shortSource = (url: string) => {
  try {
    const u = new URL(url)
    return decodeURIComponent(u.hostname.replace(/^www\./, '') + u.pathname)
  } catch {
    return url
  }
}
