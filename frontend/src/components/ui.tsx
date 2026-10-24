import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "quiet" }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55",
        variant === "primary" && "bg-burgundy px-5 py-2.5 text-paper hover:bg-burgundy-deep",
        variant === "secondary" && "border border-rule bg-card px-4 py-2 text-ink hover:border-ink-soft/40 hover:bg-paper-deep",
        variant === "quiet" && "px-1.5 py-1 text-burgundy underline decoration-burgundy/30 underline-offset-4 hover:decoration-burgundy",
        className,
      )}
    />
  );
}

/** Small-caps section label in the journal style: "II · Recommendation". */
export function SectionHeading({ numeral, title, aside, id }: { numeral: string; title: string; aside?: ReactNode; id?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule pb-2">
      <h2 id={id} className="font-serif text-[1.45rem] leading-tight text-ink">
        <span className="mr-2.5 font-sans text-xs font-semibold tracking-[0.18em] text-bronze uppercase">{numeral}</span>
        {title}
      </h2>
      {aside ? <div className="text-xs text-muted">{aside}</div> : null}
    </div>
  );
}

export function Tag({ tone = "neutral", children, title }: { tone?: "neutral" | "burgundy" | "bronze" | "moss" | "amber"; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[0.7rem] font-medium tracking-wide uppercase",
        tone === "neutral" && "bg-paper-deep text-ink-soft",
        tone === "burgundy" && "bg-burgundy-wash text-burgundy",
        tone === "bronze" && "bg-bronze-wash text-bronze",
        tone === "moss" && "bg-moss-wash text-moss",
        tone === "amber" && "bg-amber-wash text-amber",
      )}
    >
      {children}
    </span>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 text-[0.7rem] font-semibold tracking-[0.14em] text-muted uppercase">{children}</p>;
}

export function BulletList({ items, className }: { items: ReactNode[]; className?: string }) {
  if (!items.length) return null;
  return (
    <ul className={cx("space-y-1.5", className)}>
      {items.map((item, i) => (
        <li key={i} className="relative pl-4 leading-relaxed before:absolute before:top-[0.7em] before:left-0 before:h-px before:w-2 before:bg-bronze/70">
          {item}
        </li>
      ))}
    </ul>
  );
}
