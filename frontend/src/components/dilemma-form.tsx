"use client";

import { useId, type FormEvent, type ReactNode } from "react";
import { LIMITS } from "@/lib/contracts/advice";
import { countStated, type ContextForm } from "@/lib/client/context-form";
import { PRESETS } from "@/lib/demo/presets";
import { ArrowRight, Button, PlusIcon, cx } from "./ui";

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

/** The question form. It sits on the black panel, so its controls are drawn for a dark background. */
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
    <form onSubmit={submit} noValidate className="space-y-8">
      <div>
        <label htmlFor={ids.query} className="eyebrow mb-4 block text-white/80">
          Describe your dilemma
        </label>
        <textarea
          id={ids.query}
          value={p.query}
          onChange={(e) => p.onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") p.onSubmit();
          }}
          placeholder={PLACEHOLDER}
          rows={6}
          maxLength={LIMITS.queryMax}
          aria-describedby={`${ids.help}${p.error ? ` ${ids.err}` : ""}`}
          aria-invalid={Boolean(p.error)}
          className={cx(
            "block w-full resize-y rounded-[4px] border bg-white/[0.035] px-5 py-4 font-display text-[1.25rem] leading-relaxed font-light text-white transition-[border-color,background-color,box-shadow] duration-300 placeholder:text-white/35 placeholder:italic focus:bg-white/[0.06] focus:shadow-[0_0_0_4px_rgb(255_255_255/0.08)] focus:outline-none focus-visible:outline-none sm:text-[1.4rem]",
            p.error ? "border-danger-soft" : "border-white/15 focus:border-accent",
          )}
        />
        <div className="mt-3 flex justify-between gap-4 text-xs text-white/60">
          <span id={ids.help}>Say what the options are, who is involved and what makes it hard.</span>
          <span aria-hidden="true" className={cx("tabular-nums", length > LIMITS.queryMax * 0.9 && "text-danger-soft")}>
            {length}/{LIMITS.queryMax}
          </span>
        </div>
        {p.error ? (
          <p id={ids.err} role="alert" className="mt-2 text-sm text-danger-soft">
            {p.error}
          </p>
        ) : null}
      </div>

      <div>
        <p className="eyebrow mb-4 text-white/60">Or try an example</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => {
            const on = p.query.trim() === preset.query;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={p.busy}
                onClick={() => p.onPreset(preset.query)}
                aria-pressed={on}
                className={cx(
                  "h-10 rounded-full border px-4 text-[0.8125rem] transition-[background-color,color,border-color,transform] duration-200 ease-out-soft enabled:hover:-translate-y-px disabled:opacity-50",
                  on ? "border-accent bg-accent text-night" : "border-white/15 text-white/75 hover:border-white/50 hover:text-white",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-y border-white/12">
        <button
          type="button"
          aria-expanded={p.contextOpen}
          aria-controls={ids.ctx}
          onClick={() => p.onContextOpenChange(!p.contextOpen)}
          className="flex w-full items-center justify-between gap-3 py-5 text-left text-sm text-white/70 transition-colors hover:text-white"
        >
          <span>
            <span className="font-semibold text-white">Add context</span> <span className="text-white/55">(optional) deadline, reversibility, fallback</span>
          </span>
          <span className="flex items-center gap-3 text-xs">
            {stated ? <span className="rounded-full bg-accent px-2 py-[4px] leading-none font-semibold text-night">{stated} stated</span> : null}
            <PlusIcon className={cx("text-accent transition-transform duration-300 ease-out-soft", p.contextOpen && "rotate-45")} />
          </span>
        </button>
        {p.contextOpen ? (
          <div id={ids.ctx} className="grid animate-rise gap-5 pt-1 pb-7 sm:grid-cols-2">
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

      <div className="flex flex-wrap items-center gap-5 pt-1">
        <Button type="submit" variant="light" size="lg" disabled={p.busy}>
          {p.busy ? "Working…" : "Find historical comparisons"}
          {p.busy ? null : <ArrowRight className="transition-transform duration-300 ease-out-soft group-hover/btn:translate-x-1" />}
        </Button>
        {p.busy ? (
          <Button variant="outline-light" size="lg" onClick={p.onCancel}>
            Cancel
          </Button>
        ) : (
          <span className="text-xs text-white/55">or press ⌘/Ctrl + Enter</span>
        )}
      </div>
    </form>
  );
}

const inputClass = "h-11 rounded-[3px] border border-white/15 bg-white/[0.04] px-3 text-sm text-white transition-colors placeholder:text-white/35 focus:border-accent focus:outline-none";

function Field({ label, children, wide, group }: { label: string; children: ReactNode; wide?: boolean; group?: boolean }) {
  const cls = cx("block text-sm [&_textarea]:h-auto [&_textarea]:py-2", wide && "sm:col-span-2");
  const caption = <span className="mb-2 block text-white/75">{label}</span>;
  if (group) {
    return (
      <div role="group" aria-label={label} className={cls}>
        {caption}
        {children}
      </div>
    );
  }
  return (
    <label className={cls}>
      {caption}
      {children}
    </label>
  );
}
