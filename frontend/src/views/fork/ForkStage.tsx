import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import type { Moment, Path } from '../../data/types'
import { fractionOf, yearsLaterAt } from '../../data/normalize'
import { gsap, MOTION_OK, useGSAP } from '../../lib/gsap'
import Avatar from '../../components/Avatar'
import EventChips from '../../components/EventChips'
import Odometer from './Odometer'
import { isHighlighted, opacityFor, type Focus } from './focus'

/* Timeline units (scrubbed, so only the ratios matter). */
const T_TRUNK = 1
const T_FORK = 0.3
const T_BRANCH = 5
const T_HOLD = 1.2
const BRANCH_START = T_TRUNK + T_FORK

export interface StageApi {
  scrollTo: (pathId: string, index: number) => void
}

interface Props {
  paths: Path[] // exactly two are drawn: [upper, lower]
  focus: Focus | null
  handleT: number
  onHover: (f: Focus | null) => void
  onHandle: (t: number) => void
  onReveal: (counts: number[]) => void
  apiRef: React.MutableRefObject<StageApi | null>
}

interface Layout {
  W: number
  H: number
  midY: number
  cx: number
  forkX: number
  r: number
  first: number
  last: number
  cardW: number
  bodyLines: number
  branches: {
    y: number
    d: string
    dots: { x: number; y: number; above: boolean; frac: number }[]
  }[]
  trunk: string
}

function computeLayout(W: number, H: number, paths: Path[]): Layout {
  const midY = H / 2
  const gap = Math.min(H * 0.25, 230)
  const forkX = Math.round(W * 0.2)
  const r = 9
  const branchX0 = forkX + Math.max(110, W * 0.11)
  const endX = W - 2
  const first = branchX0 + 30
  const maxN = Math.max(...paths.map((p) => p.events.length), 2)

  // Same-side neighbours are two dots apart, so a card may be ~2 spacings wide.
  let cardW = 270
  for (let k = 0; k < 3; k++) {
    const last = W - cardW / 2 - 4
    cardW = Math.min(270, Math.max(170, (2 * (last - first)) / (maxN - 1) - 20))
  }
  const last = W - cardW / 2 - 4

  // Room for a card between its line and the next thing (bar edge or the handle pill).
  const zone = gap - 16 - 20
  const bodyLines = Math.max(1, Math.min(4, Math.floor((zone - 100) / 18)))

  const cx = (forkX + branchX0) / 2
  const branches = paths.slice(0, 2).map((p, k) => {
    const y = k === 0 ? midY - gap : midY + gap
    const straight = endX - branchX0
    // Cubic from (forkX+r, midY) to (branchX0, y): approximate its length well
    // enough for timing by sampling.
    let bez = 0
    let px = forkX + r
    let py = midY
    for (let s = 1; s <= 24; s++) {
      const t = s / 24
      const u = 1 - t
      const x = u * u * u * (forkX + r) + 3 * u * u * t * cx + 3 * u * t * t * cx + t * t * t * branchX0
      const yy = u * u * u * midY + 3 * u * u * t * midY + 3 * u * t * t * y + t * t * t * y
      bez += Math.hypot(x - px, yy - py)
      px = x
      py = yy
    }
    const total = bez + straight
    const n = p.events.length
    const dots = p.events.map((_, i) => {
      const x = first + fractionOf(p, i) * (last - first) * (n > 1 ? 1 : 0)
      // mirror-image alternation: upper path starts above, lower starts below,
      // so neither first card sits over its own curve
      return { x, y, above: (i + k) % 2 === 0, frac: (bez + (x - branchX0)) / total }
    })
    return {
      y,
      dots,
      d: `M ${forkX + r} ${midY} C ${cx} ${midY}, ${cx} ${y}, ${branchX0} ${y} L ${endX} ${y}`,
    }
  })

  return { W, H, midY, cx, forkX, r, first, last, cardW, bodyLines, branches, trunk: `M 0 ${midY} L ${forkX - r} ${midY}` }
}

const dotTime = (frac: number) => BRANCH_START + T_BRANCH * frac

export default function ForkStage({ paths, focus, handleT, onHover, onHandle, onReveal, apiRef }: Props) {
  const section = useRef<HTMLElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ W: number; H: number } | null>(null)
  const revealed = useRef<string>('')
  const [handleOn, setHandleOn] = useState(false)

  useLayoutEffect(() => {
    const el = box.current!
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect
      setSize((s) => (s && Math.abs(s.W - width) < 1 && Math.abs(s.H - height) < 1 ? s : { W: width, H: height }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const L = useMemo(() => (size ? computeLayout(size.W, size.H, paths) : null), [size, paths])
  const drawn = paths.slice(0, 2)

  const report = (counts: number[]) => {
    const key = counts.join(',')
    if (key !== revealed.current) {
      revealed.current = key
      onReveal(counts)
    }
  }

  useGSAP(
    () => {
      if (!L) return
      const mm = gsap.matchMedia()

      mm.add(MOTION_OK, () => {
        const q = gsap.utils.selector(section)
        const times = L.branches.map((b) => b.dots.map((d) => dotTime(d.frac)))
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: section.current,
            start: 'top top',
            end: () => `+=${Math.round(window.innerHeight * 3.4)}`,
            pin: true,
            scrub: 0.6,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
          onUpdate: () => {
            const now = tl.time() + 0.05
            report(times.map((ts) => ts.filter((t) => t <= now).length))
            setHandleOn(now >= BRANCH_START + T_BRANCH)
          },
        })

        const trunk = q<SVGPathElement>('[data-trunk]')[0]!
        const tLen = trunk.getTotalLength()
        tl.fromTo(trunk, { strokeDasharray: tLen, strokeDashoffset: tLen }, { strokeDashoffset: 0, duration: T_TRUNK }, 0)
        tl.fromTo('[data-you]', { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0)
        tl.fromTo(
          '[data-fork-node]',
          { scale: 0, transformOrigin: '50% 50%' },
          { scale: 1, duration: T_FORK, ease: 'back.out(3)' },
          T_TRUNK,
        )
        tl.fromTo('[data-fork-label]', { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: T_FORK }, T_TRUNK)

        q<SVGPathElement>('[data-branch]').forEach((p) => {
          const len = p.getTotalLength()
          tl.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: T_BRANCH }, BRANCH_START)
        })
        tl.fromTo(
          '[data-figure]',
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', stagger: 0.1 },
          BRANCH_START,
        )

        L.branches.forEach((b, k) => {
          b.dots.forEach((d, i) => {
            const at = dotTime(d.frac)
            const key = `[data-key="${k}-${i}"]`
            tl.fromTo(`[data-dot]${key}`, { scale: 0, transformOrigin: '50% 50%' }, { scale: 1, duration: 0.22, ease: 'back.out(4)' }, at)
            tl.fromTo(
              `[data-stem]${key}`,
              { scaleY: 0, transformOrigin: d.above ? '50% 100%' : '50% 0%' },
              { scaleY: 1, duration: 0.15 },
              at + 0.05,
            )
            tl.fromTo(
              `[data-card-inner]${key}`,
              { opacity: 0, y: d.above ? 18 : -18 },
              { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' },
              at + 0.1,
            )
            const strips = q(`${key} .odo-strip`)
            tl.fromTo(
              strips,
              { y: 0, yPercent: 0 },
              {
                yPercent: (_i: number, el: HTMLElement) => -10 * Number(el.dataset.digit),
                duration: 0.55,
                ease: 'power2.out',
                stagger: 0.09,
              },
              at + 0.12,
            )
          })
        })

        tl.fromTo('[data-end-label]', { opacity: 0 }, { opacity: 1, duration: 0.3 }, BRANCH_START + T_BRANCH - 0.2)
        tl.to({}, { duration: T_HOLD })

        apiRef.current = {
          scrollTo: (pathId, index) => {
            const k = drawn.findIndex((p) => p.id === pathId)
            const d = L.branches[k]?.dots[index]
            const st = tl.scrollTrigger
            if (!d || !st) return
            const at = Math.min(dotTime(d.frac) + 0.7, tl.duration())
            window.scrollTo({ top: st.start + (at / tl.duration()) * (st.end - st.start), behavior: 'smooth' })
          },
        }

        return () => {
          apiRef.current = null
        }
      })

      mm.add('(prefers-reduced-motion: reduce)', () => {
        report(L.branches.map((b) => b.dots.length))
        setHandleOn(true)
        apiRef.current = {
          scrollTo: () => section.current?.scrollIntoView({ block: 'start' }),
        }
      })
    },
    { scope: section, dependencies: [L], revertOnUpdate: true },
  )

  /* ---- years-later handle (pointer + keyboard) ---- */
  const tToX = (t: number) => (L ? L.first + t * (L.last - L.first) : 0)
  const xToT = (clientX: number) => {
    if (!L || !box.current) return 0
    const x = clientX - box.current.getBoundingClientRect().left
    return Math.min(1, Math.max(0, (x - L.first) / (L.last - L.first)))
  }
  const steps = Math.max(...drawn.map((p) => p.events.length)) - 1
  const snap = (t: number) => Math.round(t * steps) / steps
  const tweenTo = (to: number) => {
    const proxy = { t: handleT }
    gsap.to(proxy, { t: to, duration: 0.35, ease: 'power3.out', onUpdate: () => onHandle(proxy.t) })
  }
  const dragging = useRef(false)
  const onDown = (e: RPointerEvent) => {
    dragging.current = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    onHandle(xToT(e.clientX))
  }
  const onMove = (e: RPointerEvent) => dragging.current && onHandle(xToT(e.clientX))
  const onUp = (e: RPointerEvent) => {
    if (!dragging.current) return
    dragging.current = false
    tweenTo(snap(xToT(e.clientX)))
  }
  const onKey = (e: React.KeyboardEvent) => {
    const i = Math.round(handleT * steps)
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowUp' ? i + 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? i - 1
      : e.key === 'Home' ? 0
      : e.key === 'End' ? steps
      : null
    if (next === null) return
    e.preventDefault()
    tweenTo(Math.min(steps, Math.max(0, next)) / steps)
  }

  const years = drawn.map((p) => yearsLaterAt(p, handleT))
  const valueText = drawn.map((p, k) => `${p.surname} ${years[k]} years later`).join(', ')

  return (
    <section
      ref={section}
      aria-labelledby="fork-stage-title"
      className="relative h-svh overflow-hidden bg-cream pb-6 pt-[104px]"
    >
      <h2 id="fork-stage-title" className="sr-only">
        The fork: both paths, event by event
      </h2>
      <div className="mx-auto h-full max-w-[1440px] px-12">
        <div ref={box} className="relative h-full w-full">
          {L && (
            <>
              <svg width={L.W} height={L.H} className="absolute inset-0 overflow-visible" aria-hidden>
                <path data-trunk d={L.trunk} fill="none" stroke="#14120F" strokeWidth={1.5} />
                <circle data-fork-node cx={L.forkX} cy={L.midY} r={L.r} fill="#F2EDE4" stroke="#14120F" strokeWidth={1.5} />
                {L.branches.map((b, k) => {
                  const p = drawn[k]!
                  return (
                    <g key={p.id} style={{ opacity: opacityFor(focus, p), transition: 'opacity .35s' }}>
                      <path data-branch d={b.d} fill="none" stroke={p.color} strokeWidth={2} strokeLinecap="round" />
                    </g>
                  )
                })}
                {L.branches.map((b, k) => {
                  const p = drawn[k]!
                  return b.dots.map((d, i) => {
                    const hi = isHighlighted(focus, p, i)
                    return (
                      <g key={`${p.id}-${i}`} style={{ opacity: opacityFor(focus, p, i), transition: 'opacity .35s' }}>
                        <line
                          data-stem
                          data-key={`${k}-${i}`}
                          x1={d.x}
                          x2={d.x}
                          y1={d.above ? d.y - 6 : d.y + 6}
                          y2={d.above ? d.y - 16 : d.y + 16}
                          stroke={p.color}
                          strokeWidth={1}
                        />
                        <circle
                          data-dot
                          data-key={`${k}-${i}`}
                          cx={d.x}
                          cy={d.y}
                          r={hi ? 8 : 6}
                          fill={hi ? p.color : '#F2EDE4'}
                          stroke={p.color}
                          strokeWidth={2}
                          style={{ transition: 'r .25s, fill .25s' }}
                        />
                      </g>
                    )
                  })
                })}
              </svg>

              {/* labels on the trunk */}
              <p data-you className="label font-plex absolute left-0 text-ink" style={{ top: L.midY - 26 }}>
                You, now
              </p>
              <p
                data-fork-label
                className="label font-plex absolute text-right text-ink"
                style={{ top: L.midY + 14, left: L.forkX - 120, width: 120 + L.r }}
              >
                The fork
              </p>

              {drawn.map((p, k) => {
                const b = L.branches[k]!
                return (
                  <div key={p.id} style={{ opacity: opacityFor(focus, p), transition: 'opacity .35s' }}>
                    {/* figure header, left of its branch */}
                    <div
                      data-figure
                      className="absolute left-0 flex -translate-y-1/2 items-center gap-3"
                      style={{ top: b.y, width: L.cx - 16 }}
                    >
                      <Avatar initials={p.initials} color={p.color} size={46} />
                      <div className="min-w-0">
                        <p className="label font-plex" style={{ color: p.color }}>
                          Path {p.id} · {p.label}
                        </p>
                        <p className="font-playfair text-[22px] leading-tight text-ink">{p.figure}</p>
                        <p className="label font-plex text-ink/60">
                          Aged {p.age} · {p.year}
                        </p>
                      </div>
                    </div>
                    <p
                      data-end-label
                      className="label font-plex absolute right-0 text-right"
                      style={{ top: b.dots.at(-1)?.above === false ? b.y - 26 : b.y + 12, color: p.color }}
                    >
                      +{p.events.at(-1)?.yearsLater ?? 0} yrs
                    </p>
                  </div>
                )
              })}

              {drawn.map((p, k) =>
                p.events.map((e, i) => {
                  const d = L.branches[k]!.dots[i]!
                  const left = Math.min(Math.max(d.x - L.cardW / 2, 0), L.W - L.cardW)
                  return (
                    <EventCard
                      key={`${p.id}-${i}`}
                      path={p}
                      event={e}
                      k={k}
                      above={d.above}
                      style={{
                        left,
                        top: d.above ? d.y - 16 : d.y + 16,
                        width: L.cardW,
                        transform: d.above ? 'translateY(-100%)' : undefined,
                        opacity: opacityFor(focus, p, i),
                      }}
                      bodyLines={L.bodyLines}
                      highlighted={isHighlighted(focus, p, i)}
                      onHover={(on) => onHover(on ? { source: p.id, t: fractionOf(p, i) } : null)}
                    />
                  )
                }),
              )}

              {/* years-later handle: one hairline riding both paths */}
              <div
                data-handle
                aria-hidden={!handleOn}
                className="pointer-events-none absolute top-0 transition-opacity duration-500"
                style={{ left: tToX(handleT), height: L.H, opacity: handleOn ? 1 : 0, visibility: handleOn ? 'visible' : 'hidden' }}
              >
                <div
                  className="absolute -translate-x-1/2 border-l border-dashed border-ink/60"
                  style={{ top: L.branches[0]!.y, height: L.branches[1]!.y - L.branches[0]!.y }}
                />
                {L.branches.map((b, k) => (
                  <span
                    key={k}
                    onPointerDown={onDown}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    className="pointer-events-auto absolute z-20 size-[18px] -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full border-2 bg-cream"
                    style={{ top: b.y, borderColor: drawn[k]!.color }}
                  />
                ))}
                <div
                  role="slider"
                  tabIndex={0}
                  aria-label="Years later, on both paths"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(handleT * 100)}
                  aria-valuetext={valueText}
                  onKeyDown={onKey}
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  className="label font-plex pointer-events-auto absolute z-20 flex -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none select-none items-center gap-2 whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-cream shadow-[0_4px_16px_rgba(20,18,15,.25)]"
                  style={{ top: L.midY }}
                >
                  <span aria-hidden>⟵</span>
                  {drawn.map((p, k) => (
                    <span key={p.id} className="flex items-center gap-1">
                      <span className="size-2 rounded-full" style={{ background: p.color }} />+{years[k]}
                    </span>
                  ))}
                  <span>yrs later</span>
                  <span aria-hidden>⟶</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

function EventCard({
  path,
  event,
  k,
  above,
  style,
  bodyLines,
  highlighted,
  onHover,
}: {
  path: Path
  event: Moment
  k: number
  above: boolean
  style: React.CSSProperties
  bodyLines: number
  highlighted: boolean
  onHover: (on: boolean) => void
}) {
  return (
    <article
      tabIndex={0}
      aria-label={`Path ${path.id}, ${path.figure}, ${event.date}: ${event.title}`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className="group absolute z-10 outline-none"
      style={{ ...style, transition: 'opacity .35s' }}
    >
      <div
        data-card-inner
        data-key={`${k}-${event.index}`}
        className="border bg-cream p-3 transition-[border-color,box-shadow,translate] duration-300 group-focus-visible:outline-2 group-focus-visible:outline-offset-2"
        style={{
          borderColor: highlighted ? path.color : 'rgba(20,18,15,.16)',
          boxShadow: highlighted ? `0 10px 28px -12px ${path.color}aa, inset 3px 0 0 ${path.color}` : 'none',
          translate: highlighted ? `0 ${above ? -4 : 4}px` : '0 0',
          outlineColor: path.color,
        }}
      >
        <p className="label font-plex flex items-baseline justify-between gap-2" style={{ color: path.color }}>
          <Odometer value={event.date} />
          {event.yearsLater !== null && <span className="text-ink/45">+{event.yearsLater} yrs</span>}
        </p>
        <h3 className="mt-1 font-playfair text-[19px] leading-snug text-ink">{event.title}</h3>
        <p
          className="mt-1 overflow-hidden font-inter text-[13px] leading-[18px] text-ink/80"
          style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: bodyLines }}
          title={event.body}
        >
          {event.body}
        </p>
        <div className="mt-2">
          <EventChips event={event} className="font-plex text-[9.5px] uppercase tracking-[1px] text-ink/70 border-ink/25" />
        </div>
      </div>
    </article>
  )
}
