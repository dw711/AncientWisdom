/**
 * Wire format for one "mirror" result. This is exactly what the backend is
 * expected to return; `mirror.mock.json` is a hand-written instance of it.
 * Fields marked optional have sensible fallbacks in `normalize.ts`.
 */
export type EventType = 'observation' | 'interpretation'

export interface MirrorEvent {
  date: string // free text, e.g. "Aug 1831" or "1835"; the first 4-digit run is the year
  title: string
  body: string
  type?: EventType
  sources?: string[]
}

export interface MirrorPath {
  id: string
  label: string
  figure: string
  age: number
  year: number
  color: string
  /** 0–100 per dimension; any keys are rendered (camelCase becomes words). */
  fit: Record<string, number>
  events: MirrorEvent[]
  /** One line on what choosing this life says you value. */
  reflection?: string
  /** Short edition name for The Precedent, e.g. "You go". Falls back to `label`. */
  kicker?: string
}

export interface Mirror {
  dilemma: string
  shape: string[]
  paths: MirrorPath[]
  neitherReflection?: string
}

/* ---- Normalised shapes the components consume ---- */

export interface Moment extends MirrorEvent {
  index: number
  year: number | null
  /** Years since the figure's decision year (`path.year`). */
  yearsLater: number | null
  type: EventType
  sources: string[]
}

export interface Path extends Omit<MirrorPath, 'events'> {
  initials: string
  surname: string
  kicker: string
  reflection: string
  events: Moment[]
}

export interface MirrorView {
  dilemma: string
  shape: string[]
  paths: Path[]
  neitherReflection: string
  sources: string[]
}
