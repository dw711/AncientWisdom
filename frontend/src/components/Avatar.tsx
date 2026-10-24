interface Props {
  initials: string
  color: string
  size?: number
  className?: string
}

/** Initials-only portrait (no images). */
export default function Avatar({ initials, color, size = 44, className = '' }: Props) {
  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center rounded-full font-playfair italic text-white ${className}`}
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {initials}
    </span>
  )
}
