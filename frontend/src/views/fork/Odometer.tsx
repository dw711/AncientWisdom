const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

/**
 * Renders e.g. "Aug 1831" with each digit as a rolling 0–9 strip. The resting
 * state shows the real value; animations roll `.odo-strip` from 0 to
 * `data-digit` (see ForkStage), so reduced-motion just shows the number.
 */
export default function Odometer({ value, className = '' }: { value: string; className?: string }) {
  return (
    <span className={`odometer inline-flex items-end whitespace-pre ${className}`} aria-label={value} role="text">
      {[...value].map((c, i) =>
        /\d/.test(c) ? (
          <span key={i} className="odo-digit" aria-hidden>
            <span className="odo-strip" data-digit={c} style={{ transform: `translateY(-${Number(c) * 10}%)` }}>
              {DIGITS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={i} aria-hidden>
            {c}
          </span>
        ),
      )}
    </span>
  )
}
