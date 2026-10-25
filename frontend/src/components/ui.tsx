import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** Lower-cases a leading capital unless the word is an acronym ("NASA"). */
export const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s);

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
        variant === "primary" && "border-2 border-ink bg-ink px-6 py-3 text-paper hover:bg-burgundy hover:border-burgundy",
        variant === "secondary" && "border-2 border-ink px-5 py-2.5 text-ink hover:bg-ink hover:text-paper",
        variant === "quiet" && "px-1 py-1 text-burgundy underline decoration-burgundy/40 underline-offset-4 hover:decoration-burgundy",
        className,
      )}
    />
  );
}

/** Section head in the newspaper style: thick rule, mono kicker, display title. `bare` drops the rule when the section draws its own. */
export function SectionHeading({ numeral, title, aside, id, bare }: { numeral: string; title: string; aside?: ReactNode; id?: string; bare?: boolean }) {
  return (
    <div className={cx("mb-5", !bare && "border-t-[3px] border-ink pt-2")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="label text-burgundy">{numeral}</p>
        {aside ? <div className="label text-muted">{aside}</div> : null}
      </div>
      <h2 id={id} className="mt-1 font-display text-[1.9rem] leading-tight font-black tracking-[-0.02em] text-ink">
        {title}
      </h2>
    </div>
  );
}

export function Tag({ tone = "neutral", children, title }: { tone?: "neutral" | "burgundy" | "bronze" | "moss" | "amber"; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center rounded-full border px-2 py-[3px] font-mono text-[10px] leading-none tracking-[1px] uppercase",
        tone === "neutral" && "border-ink/40 text-ink/75",
        tone === "burgundy" && "border-burgundy/60 text-burgundy",
        tone === "bronze" && "border-dashed border-ink/50 text-ink/75",
        tone === "moss" && "border-moss/60 text-moss",
        tone === "amber" && "border-amber/60 text-amber",
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
        <li key={i} className="relative pl-4 leading-relaxed before:absolute before:top-[0.55em] before:left-0 before:text-[0.7em] before:content-['■'] before:opacity-60">
          {item}
        </li>
      ))}
    </ul>
  );
}
