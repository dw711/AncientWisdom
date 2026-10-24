import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Path } from '../../data/types'
import { Flip, prefersReducedMotion } from '../../lib/gsap'

interface Tile {
  key: string
  span: string
  bg: string
  fg: string
  content: React.ReactNode
}

/**
 * Initials-and-facts collage of the two correspondents. Hovering (or pressing
 * the shuffle button) reshuffles the tiles with a FLIP animation.
 */
export default function Collage({ paths, colors }: { paths: Path[]; colors: string[] }) {
  const tiles = useMemo<Tile[]>(
    () =>
      paths.flatMap((p, k) => {
        const c = colors[k % colors.length]!
        return [
          {
            key: `${p.id}-ini`,
            span: 'col-span-2 row-span-2',
            bg: c,
            fg: '#EDEAE2',
            content: <span className="font-editorial text-[64px] italic leading-none">{p.initials}</span>,
          },
          {
            key: `${p.id}-name`,
            span: 'col-span-2',
            bg: 'transparent',
            fg: '#111',
            content: <span className="font-editorial text-[22px] leading-tight">{p.figure}</span>,
          },
          {
            key: `${p.id}-age`,
            span: '',
            bg: '#111',
            fg: '#EDEAE2',
            content: (
              <span className="text-center">
                <span className="block font-editorial text-[30px] leading-none">{p.age}</span>
                <span className="label font-fragment opacity-70">aged</span>
              </span>
            ),
          },
          {
            key: `${p.id}-year`,
            span: '',
            bg: 'transparent',
            fg: c,
            content: <span className="font-fragment text-[18px]">{p.year}</span>,
          },
        ]
      }),
    [paths, colors],
  )

  const [order, setOrder] = useState(() => tiles.map((t) => t.key))
  const grid = useRef<HTMLDivElement>(null)
  const flipState = useRef<Flip.FlipState | null>(null)

  useLayoutEffect(() => setOrder(tiles.map((t) => t.key)), [tiles])

  const shuffle = () => {
    if (!prefersReducedMotion() && grid.current) flipState.current = Flip.getState(grid.current.children)
    setOrder((o) => {
      const next = [...o]
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[next[i], next[j]] = [next[j]!, next[i]!]
      }
      return next
    })
  }

  useLayoutEffect(() => {
    if (!flipState.current) return
    Flip.from(flipState.current, { duration: 0.6, ease: 'power3.inOut', stagger: 0.02, absolute: true })
    flipState.current = null
  }, [order])

  const byKey = new Map(tiles.map((t) => [t.key, t]))

  return (
    <figure className="mt-8">
      <figcaption className="label font-fragment mb-3 flex items-center justify-between text-press">
        <span>In this edition</span>
        <button type="button" onClick={shuffle} className="underline-offset-4 hover:underline">
          Shuffle ↻
        </button>
      </figcaption>
      <div
        ref={grid}
        onMouseEnter={shuffle}
        className="grid grid-flow-dense grid-cols-4 auto-rows-[78px] gap-[3px] border border-press bg-press p-[3px]"
      >
        {order.map((k) => {
          const t = byKey.get(k)
          if (!t) return null
          return (
            <div
              key={k}
              className={`grid place-items-center overflow-hidden px-2 ${t.span}`}
              style={{ background: t.bg === 'transparent' ? '#EDEAE2' : t.bg, color: t.fg }}
            >
              {t.content}
            </div>
          )
        })}
      </div>
    </figure>
  )
}
