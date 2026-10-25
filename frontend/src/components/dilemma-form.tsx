"use client";

import { useId, type FormEvent, type ReactNode } from "react";
import { LIMITS } from "@/lib/contracts/advice";
import { countStated, type ContextForm } from "@/lib/client/context-form";
import { PRESETS } from "@/lib/demo/presets";
import { Button, cx } from "./ui";

const PLACEHOLDER =
  "For example: My co-founder wants to accept a large client who is asking for a discount we can barely afford. Turning them down could cost us months of runway; accepting could fix a price we can't sustain. What should we weigh?";

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  context: ContextForm;
  onContextChange: (c: ContextForm) => void;
  contextOpen: boolean;
  onContextOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onPreset: (query: string) => void;
  busy: boolean;
  error: string | null;
}

export function DilemmaForm(p: Props) {
  const ids = { query: useId(), help: useId(), err: useId(), ctx: useId() };
  const length = p.query.trim().length;
  const stated = countStated(p.context);
  const set = <K extends keyof ContextForm>(key: K, value: ContextForm[K]) => p.onContextChange({ ...p.context, [key]: value });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    p.onSubmit();
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div>
        <label htmlFor={ids.query} className="label mb-3 block text-muted">
          Your dilemma
        </label>
        <textarea
          id={ids.query}
          value={p.query}
          onChange={(e) => p.onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") p.onSubmit();
          }}
          placeholder={PLACEHOLDER}
          rows={7}
          maxLength={LIMITS.queryMax}
          aria-describedby={`${ids.help}${p.error ? ` ${ids.err}` : ""}`}
          aria-invalid={Boolean(p.error)}
          className={cx(
            "block w-full resize-y border-0 border-b bg-transparent px-0 py-3 font-serif text-[1.45rem] leading-snug text-ink italic placeholder:text-muted/60 focus:border-ink focus:outline-none focus-visible:outline-none",
            p.error ? "border-burgundy" : "border-ink/40",
          )}
        />
        <div className="mt-2 flex justify-between gap-4 font-mono text-[11px] text-muted">
          <span id={ids.help}>Say what the options are, who is involved and what makes it hard.</span>
          <span aria-hidden="true" className={cx(length > LIMITS.queryMax * 0.9 && "text-burgundy")}>
            {length}/{LIMITS.queryMax}
          </span>
        </div>
        {p.error ? (
          <p id={ids.err} role="alert" className="mt-2 text-sm text-burgundy">
            {p.error}
          </p>
        ) : null}
      </div>

      <div>
        <p className="label mb-2 text-muted">Or try an example</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={p.busy}
              onClick={() => p.onPreset(preset.query)}
              aria-pressed={p.query.trim() === preset.query}
              className={cx(
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors disabled:opacity-50",
                p.query.trim() === preset.query ? "border-ink bg-ink text-paper" : "border-ink/30 text-ink-soft hover:border-ink hover:text-ink",
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-y border-ink/20">
        <button
          type="button"
          aria-expanded={p.contextOpen}
          aria-controls={ids.ctx}
          onClick={() => p.onContextOpenChange(!p.contextOpen)}
          className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm text-ink-soft hover:text-ink"
        >
          <span>
            <span className="label text-ink">Add context</span> <span className="text-muted">(optional) deadline, reversibility, fallback</span>
          </span>
          <span className="flex items-center gap-2 text-xs text-muted">
            {stated ? <span className="label rounded-full border border-ink/30 px-2 py-0.5 text-ink">{stated} stated</span> : null}
            <span aria-hidden="true" className={cx("transition-transform", p.contextOpen && "rotate-180")}>
              ⌄
            </span>
          </span>
        </button>
        {p.contextOpen ? (
          <div id={ids.ctx} className="grid gap-4 border-t border-ink/15 py-4 sm:grid-cols-2">
            <Field label="Time until you must decide" group>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={p.context.deadlineValue}
                  onChange={(e) => set("deadlineValue", e.target.value)}
                  className={inputClass + " w-24"}
                  aria-label="Amount of time"
                  placeholder="e.g. 24"
                />
                <select value={p.context.deadlineUnit} onChange={(e) => set("deadlineUnit", e.target.value as ContextForm["deadlineUnit"])} className={inputClass} aria-label="Unit">
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </select>
              </div>
            </Field>
            <Field label="Can the choice be undone?">
              <select value={p.context.reversibility} onChange={(e) => set("reversibility", e.target.value as ContextForm["reversibility"])} className={inputClass}>
                <option value="">Not sure</option>
                <option value="reversible">Yes, easily</option>
                <option value="partly_reversible">Partly</option>
                <option value="irreversible">No</option>
              </select>
            </Field>
            <Field label="Is there a tested way back (rollback or fallback)?">
              <select value={p.context.rollback} onChange={(e) => set("rollback", e.target.value as ContextForm["rollback"])} className={inputClass}>
                <option value="">Not sure</option>
                <option value="yes">Yes, tested</option>
                <option value="no">No</option>
              </select>
            </Field>
            <Field label="How much is at stake?">
              <select value={p.context.stakes} onChange={(e) => set("stakes", e.target.value as ContextForm["stakes"])} className={inputClass}>
                <option value="">Not sure</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>
            <Field label="Will you keep dealing with the people involved?">
              <select value={p.context.relationship} onChange={(e) => set("relationship", e.target.value as ContextForm["relationship"])} className={inputClass}>
                <option value="">Not sure</option>
                <option value="repeated">Yes, repeatedly</option>
                <option value="one_off">No, this is a one-off</option>
              </select>
            </Field>
            <Field label="Anything else that matters" wide>
              <textarea
                value={p.context.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={2}
                maxLength={LIMITS.notesMax}
                className={inputClass + " w-full resize-y"}
                placeholder="A constraint, a fact you are sure of, or an assumption to test"
              />
            </Field>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={p.busy}>
          {p.busy ? "Working…" : "Find the paths"}
        </Button>
        {p.busy ? (
          <Button variant="secondary" onClick={p.onCancel}>
            Cancel
          </Button>
        ) : (
          <span className="font-mono text-[11px] text-muted">or press ⌘/Ctrl + Enter</span>
        )}
      </div>
    </form>
  );
}

const inputClass = "border border-ink/30 bg-paper px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none";

function Field({ label, children, wide, group }: { label: string; children: ReactNode; wide?: boolean; group?: boolean }) {
  if (group) {
    return (
      <div role="group" aria-label={label} className={cx("block text-sm", wide && "sm:col-span-2")}>
        <span className="label mb-1.5 block text-muted">{label}</span>
        {children}
      </div>
    );
  }
  return (
    <label className={cx("block text-sm", wide && "sm:col-span-2")}>
      <span className="label mb-1.5 block text-muted">{label}</span>
      {children}
    </label>
  );
}
