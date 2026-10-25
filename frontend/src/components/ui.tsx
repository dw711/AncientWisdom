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
        "label inline-flex items-center justify-center gap-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "rounded-full bg-ink px-5 py-2.5 text-paper hover:bg-ink/85",
        variant === "secondary" && "rounded-full border border-ink px-4 py-2 text-ink hover:bg-ink hover:text-paper",
        variant === "quiet" && "px-1.5 py-1 text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink",
        className,
      )}
    />
  );
}

/** Mono numeral plus serif title, ruled in ink: "II · Recommendation". */
export function SectionHeading({ numeral, title, aside, id }: { numeral: string; title: string; aside?: ReactNode; id?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-ink pb-2">
      <h2 id={id} className="font-serif text-[1.6rem] leading-tight text-ink">
        <span className="label mr-3 align-middle text-muted">{numeral}</span>
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
        "inline-flex items-center rounded-full border px-2 py-[3px] font-mono text-[10px] leading-none tracking-[1px] uppercase",
        tone === "neutral" && "border-ink/25 text-ink-soft",
        tone === "burgundy" && "border-burgundy/50 text-burgundy",
        tone === "bronze" && "border-dashed border-bronze/50 text-bronze",
        tone === "moss" && "border-moss/50 text-moss",
        tone === "amber" && "border-amber/50 text-amber",
      )}
    >
      {children}
    </span>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <p className="label mb-2 text-muted">{children}</p>;
}

export function BulletList({ items, className }: { items: ReactNode[]; className?: string }) {
  if (!items.length) return null;
  return (
    <ul className={cx("space-y-1.5", className)}>
      {items.map((item, i) => (
        <li key={i} className="relative pl-4 leading-relaxed before:absolute before:top-[0.7em] before:left-0 before:h-px before:w-2 before:bg-current before:opacity-50">
          {item}
        </li>
      ))}
    </ul>
  );
}
