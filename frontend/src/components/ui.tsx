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
        "inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "quiet" || size === "md" ? "text-sm" : "text-[0.95rem]",
        variant !== "quiet" && "rounded-lg",
        variant !== "quiet" && (size === "md" ? "h-[2.625rem] px-5" : "h-12 px-6"),
        variant === "primary" && "bg-ink text-white enabled:hover:bg-black",
        variant === "secondary" && "border border-ink/80 text-ink enabled:hover:bg-ink enabled:hover:text-white",
        variant === "light" && "bg-white text-ink enabled:hover:bg-paper-deep",
        variant === "outline-light" && "border border-white/35 text-white enabled:hover:border-white enabled:hover:bg-white/10",
        variant === "quiet" && "-mx-0.5 px-0.5 py-1 text-ink underline decoration-ink/25 decoration-[1.5px] underline-offset-[5px] enabled:hover:decoration-ink",
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
        "inline-flex size-10 items-center justify-center rounded-lg border transition-colors",
        tone === "light" ? "border-rule bg-card text-ink hover:border-ink hover:bg-ink hover:text-white" : "border-white/20 text-white hover:bg-white hover:text-ink",
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
      <ArrowRight className="transition-transform group-hover/arrow:translate-x-0.5" />
      <span className="underline decoration-current/25 decoration-[1.5px] underline-offset-[5px] group-hover/arrow:decoration-current">{children}</span>
    </span>
  );
}

/** Section title with an index number and a dotted rule beneath. */
export function SectionHeading({ index, title, aside, id }: { index?: string; title: string; aside?: ReactNode; id?: string }) {
  return (
    <div className="dots-b mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 pb-4">
      <h2 id={id} className="flex items-baseline gap-3 text-[1.65rem] leading-tight font-semibold tracking-[-0.035em] text-ink sm:text-[2rem]">
        {index ? <span className="text-sm font-normal tracking-normal text-muted tabular-nums">{index}</span> : null}
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
        "inline-flex items-center rounded-[5px] px-1.5 py-[3px] text-[0.75rem] leading-none font-medium whitespace-nowrap",
        tone === "outline" && "border border-ink/70 text-ink",
        tone === "dark" && "border border-ink bg-ink text-white",
        tone === "moss" && "bg-moss-wash text-moss",
        tone === "amber" && "bg-amber-wash text-amber",
        tone === "on-dark" && "border border-white/40 text-white/85",
      )}
    >
      {children}
    </span>
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("mb-2 text-[0.8125rem] font-semibold text-ink", className)}>{children}</p>;
}

export function BulletList({ items, className }: { items: ReactNode[]; className?: string }) {
  if (!items.length) return null;
  return (
    <ul className={cx("space-y-2", className)}>
      {items.map((item, i) => (
        <li key={i} className="relative pl-5 leading-relaxed before:absolute before:top-[0.78em] before:left-0 before:h-px before:w-2.5 before:bg-current before:opacity-40">
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
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 text-[0.95rem] font-medium text-ink transition-colors hover:bg-paper sm:px-10">
        <span>{title}</span>
        <PlusIcon className="transition-transform duration-300 group-open:rotate-45" />
      </summary>
      <div className="px-5 pb-8 sm:px-10">{children}</div>
    </details>
  );
}

export const CJK_FONT = { fontFamily: "var(--font-cjk)" } as const;
