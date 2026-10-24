import { useRef } from 'react'
import { humanise } from '../../data/normalize'
import { gsap, MOTION_OK, useGSAP } from '../../lib/gsap'

export default function FitBars({ fit, color, id }: { fit: Record<string, number>; color: string; id: string }) {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top 85%' } })
        tl.from('[data-fill]', { scaleX: 0, duration: 1.1, ease: 'power3.out', stagger: 0.12 })
        root.current!.querySelectorAll<HTMLElement>('[data-value]').forEach((el, i) => {
          const n = { v: 0 }
          const target = Number(el.dataset.value)
          tl.to(n, { v: target, duration: 1.1, ease: 'power3.out', onUpdate: () => (el.textContent = String(Math.round(n.v))) }, i * 0.12)
        })
        return () => root.current?.querySelectorAll<HTMLElement>('[data-value]').forEach((el) => (el.textContent = el.dataset.value!))
      })
    },
    { scope: root, dependencies: [fit], revertOnUpdate: true },
  )

  return (
    <section ref={root} aria-labelledby={`fit-${id}`} className="mt-8 border-t-[3px] border-press pt-4">
      <h4 id={`fit-${id}`} className="label font-fragment mb-4 text-press">
        How close is this to you?
      </h4>
      <dl className="space-y-3">
        {Object.entries(fit).map(([k, v]) => (
          <div key={k} className="grid grid-cols-[minmax(0,130px)_1fr_36px] items-center gap-3">
            <dt className="font-sourceserif text-[15px] text-press">{humanise(k)}</dt>
            <dd className="relative h-[10px] border border-press/70" aria-hidden>
              <span data-fill className="absolute inset-y-0 left-0 origin-left" style={{ width: `${v}%`, background: color }} />
            </dd>
            <dd className="text-right font-fragment text-[13px] tabular-nums text-press">
              <span data-value={v}>{v}</span>
              <span className="sr-only"> out of 100</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
