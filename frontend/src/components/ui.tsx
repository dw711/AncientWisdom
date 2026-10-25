import type { ButtonHTMLAttributes, ReactNode, SVGProps } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "quiet" | "light" | "outline-light";

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "md" | "lg" }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "group/btn inline-flex items-center justify-center gap-2 font-semibold tracking-[0.01em] transition-[background-color,color,border-color,transform] duration-200 ease-out-soft enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        variant === "quiet" || size === "md" ? "text-sm" : "text-[0.95rem]",
        variant !== "quiet" && "rounded-[3px]",
        variant !== "quiet" && (size === "md" ? "h-11 px-5" : "h-[3.25rem] px-7"),
        variant === "primary" && "bg-ink text-paper enabled:hover:bg-ink/80",
        variant === "secondary" && "border border-ink/70 text-ink enabled:hover:border-ink enabled:hover:bg-ink enabled:hover:text-paper",
        variant === "light" && "bg-white text-night enabled:hover:bg-white/80",
        variant === "outline-light" && "border border-white/30 text-white enabled:hover:border-white enabled:hover:bg-white/10",
        variant === "quiet" && "-mx-0.5 px-0.5 py-1 text-ink underline decoration-accent/50 decoration-1 underline-offset-[6px] enabled:hover:decoration-ink",
        className,
      )}
    />
  );
}

export function ArrowRight({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cx("size-[1.15em] shrink-0", className)} {...props}>
      <path d="M2.5 10h15M12 4.5l5.5 5.5-5.5 5.5" />
    </svg>
  );
}

export function ArrowUpRight({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cx("size-[1em] shrink-0", className)} {...props}>
      <path d="M5 15L15 5M7 5h8v8" />
    </svg>
  );
}

export function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" aria-hidden="true" className={cx("size-5 shrink-0", className)}>
      <path d="M10 3.5v13M3.5 10h13" />
    </svg>
  );
}

/** Square close button; `dark` sits on the black panels. */
export function CloseButton({ onClick, label = "Close details", tone = "light", className }: { onClick: () => void; label?: string; tone?: "light" | "dark"; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cx(
        "inline-flex size-10 items-center justify-center rounded-full border transition-[background-color,color,border-color,transform] duration-300 ease-out-soft hover:rotate-90",
        tone === "light" ? "border-rule bg-card text-ink hover:border-ink hover:bg-ink hover:text-paper" : "border-white/25 text-white hover:bg-white hover:text-night",
        className,
      )}
    >
      <PlusIcon className="rotate-45" />
    </button>
  );
}

/** A link-like action with the leading arrow used across the site. */
export function ArrowLabel({ children }: { children: ReactNode }) {
  return (
    <span className="group/arrow inline-flex items-center gap-2">
      <ArrowRight className="transition-transform duration-300 ease-out-soft group-hover/arrow:translate-x-1" />
      <span className="underline decoration-accent/60 decoration-1 underline-offset-[6px] transition-[text-decoration-color] duration-200 group-hover/arrow:decoration-current">{children}</span>
    </span>
  );
}

/** Section title with an index number and a dotted rule beneath. */
export function SectionHeading({ index, title, aside, id }: { index?: string; title: string; aside?: ReactNode; id?: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-rule pb-5">
      <h2 id={id} className="display flex items-baseline gap-4 text-[clamp(1.9rem,3.2vw,2.75rem)] leading-[1.05] text-ink">
        {index ? <span className="eyebrow translate-y-[-0.35em] text-accent-ink tabular-nums">{index}</span> : null}
        {title}
      </h2>
      {aside ? <div className="text-sm text-muted">{aside}</div> : null}
    </div>
  );
}

export function Tag({ tone = "outline", children, title }: { tone?: "outline" | "dark" | "moss" | "amber" | "on-dark"; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center rounded-[2px] px-2 py-[5px] text-[0.68rem] leading-none font-semibold tracking-[0.08em] whitespace-nowrap uppercase",
        tone === "outline" && "border border-ink/40 text-ink",
        tone === "dark" && "border border-slate bg-slate text-paper",
        tone === "moss" && "bg-moss-wash text-moss",
        tone === "amber" && "bg-amber-wash text-amber",
        tone === "on-dark" && "border border-accent/60 text-accent",
      )}
    >
      {children}
    </span>
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("eyebrow mb-3 text-accent-ink", className)}>{children}</p>;
}

export function BulletList({ items, className }: { items: ReactNode[]; className?: string }) {
  if (!items.length) return null;
  return (
    <ul className={cx("space-y-2", className)}>
      {items.map((item, i) => (
        <li key={i} className="relative pl-5 leading-relaxed before:absolute before:top-[0.8em] before:left-0 before:h-px before:w-2.5 before:bg-accent">
          {item}
        </li>
      ))}
    </ul>
  );
}

/** A full-width row that folds its content away, marked with a plus that turns into a cross. */
export function Disclosure({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <details className={cx("group border-t border-rule-soft", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 text-[0.95rem] font-semibold text-ink transition-colors duration-200 hover:bg-paper-deep/50 sm:px-10">
        <span>{title}</span>
        <PlusIcon className="text-accent-ink transition-transform duration-300 ease-out-soft group-open:rotate-45" />
      </summary>
      <div className="px-5 pb-8 group-open:animate-rise sm:px-10">{children}</div>
    </details>
  );
}

export const CJK_FONT = { fontFamily: "var(--font-cjk)" } as const;
