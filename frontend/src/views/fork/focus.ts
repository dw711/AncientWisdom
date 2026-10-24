import type { Path } from '../../data/types'
import { indexAt } from '../../data/normalize'

/**
 * What's being looked at. `t` is a 0–1 fraction along every path, so the
 * "same point" on another path is the event at the same fraction.
 * source = a path id (hovering a card on that path) or 'handle' (the slider).
 */
export interface Focus {
  source: string
  t: number
}

export const isDimmed = (focus: Focus | null, path: Path) =>
  !!focus && focus.source !== 'handle' && focus.source !== path.id

export const isHighlighted = (focus: Focus | null, path: Path, i: number) =>
  !!focus && indexAt(path, focus.t) === i

/** Opacity for an element on `path` at index i. */
export const opacityFor = (focus: Focus | null, path: Path, i?: number) =>
  isDimmed(focus, path) && (i === undefined || !isHighlighted(focus, path, i)) ? 0.3 : 1
