import { forwardRef } from 'react'

const TITLE = 'The Precedent'

/** Big centred nameplate; letters are split so they can drop in. */
const Masthead = forwardRef<HTMLElement>(function Masthead(_props, ref) {
  return (
    <header ref={ref} className="mt-3">
      <div className="h-[6px] bg-press" />
      <h1
        aria-label={TITLE}
        className="overflow-hidden py-2 text-center font-editorial text-[clamp(52px,11.7vw,168px)] font-black leading-[0.95] tracking-[-0.045em] text-press"
      >
        {[...TITLE].map((c, i) => (
          <span key={i} aria-hidden data-mast-letter className="inline-block will-change-transform">
            {c === ' ' ? ' ' : c}
          </span>
        ))}
      </h1>
      <div className="h-px bg-press" />
      <p className="label font-fragment border-b border-press py-2.5 text-center text-press">
        Two lives <span aria-hidden>·</span> One crossroads <span aria-hidden>·</span> Yours to read
      </p>
    </header>
  )
})

export default Masthead
