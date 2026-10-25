import "server-only";
import { z } from "zod";
import { abortAfter, sleep } from "@/lib/server/pipeline/runtime";

/**
 * Adapter for the System One API (POST /v1/systemone): the documented request
 * shape { model, state, questions } and typed answers. OpenRouter serves the
 * same API at https://openrouter.ai/api/v1/systemone and bills it to the
 * OpenRouter account, adding `id`, `provider` and `usage.cost`.
 * https://docs.typesafe.ai/api/system-one
 * https://openrouter.ai/docs/guides/community/typesafe-sdk
 */

type Structured = string | Record<string, unknown> | unknown[];

export type JevQuestion =
  | { type: "score"; instructions: Structured; criteria: Structured[] }
  | { type: "choice"; instructions: Structured; criteria: Record<string, Structured | null> }
  | { type: "noul"; instructions: Structured; criteria?: { true?: Structured; false?: Structured } };

const ScoreAnswerSchema = z.object({
  type: z.literal("score"),
  score: z.number(),
  confidence: z.number(),
  legend: z.record(z.string(), z.unknown()),
  probabilities: z.record(z.string(), z.number()),
});
const ChoiceAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  confidence: z.number(),
  probabilities: z.record(z.string(), z.number()),
});
const NoulAnswerSchema = z.object({ type: z.literal("noul"), noul: z.number() });

const AnswerSchema = z.discriminatedUnion("type", [ScoreAnswerSchema, ChoiceAnswerSchema, NoulAnswerSchema]);

const SystemOneResponseSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), AnswerSchema),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number(), cost: z.number().nullable().optional() }),
});

export type ScoreAnswer = z.infer<typeof ScoreAnswerSchema>;
export type ChoiceAnswer = z.infer<typeof ChoiceAnswerSchema>;
export type NoulAnswer = z.infer<typeof NoulAnswerSchema>;
export type JevAnswer = z.infer<typeof AnswerSchema>;
export type SystemOneResponse = z.infer<typeof SystemOneResponseSchema>;

export type JevErrorKind = "unconfigured" | "http" | "timeout" | "network" | "invalid_response";

export class JevError extends Error {
  constructor(
    readonly kind: JevErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "JevError";
  }
}

export interface UsageTotals {
  calls: number;
  input_tokens: number;
  cost_usd: number;
}

export interface JevClient {
  /** The pinned model ID requested; the response's `model` field records what answered. */
  readonly model: string;
  /** Running totals for this client instance (one instance per request). */
  readonly totals?: UsageTotals;
  ask(state: unknown, questions: Record<string, JevQuestion>, opts: { signal: AbortSignal; deadlineMs: number }): Promise<SystemOneResponse>;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);

export class HttpJevClient implements JevClient {
  readonly totals: UsageTotals = { calls: 0, input_tokens: 0, cost_usd: 0 };

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly url: string,
    private readonly timeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async ask(state: unknown, questions: Record<string, JevQuestion>, opts: { signal: AbortSignal; deadlineMs: number }) {
    const body = JSON.stringify({ model: this.model, state, questions });
    const startedAt = Date.now();
    let lastError: JevError | null = null;

    // At most one retry, and only when the overall deadline leaves room for it.
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = opts.deadlineMs - (Date.now() - startedAt);
      if (remaining < 1500) break;
      const timed = abortAfter(Math.min(this.timeoutMs, remaining), opts.signal);
      let res: Response;
      let json: unknown;
      try {
        res = await this.fetchImpl(this.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
          body,
          signal: timed.signal,
        });
        // The timeout must also cover reading the body, not just the headers.
        json = res.ok ? await res.json() : undefined;
      } catch (err) {
        if (opts.signal.aborted) throw new JevError("timeout", "Jev request cancelled by the overall deadline");
        const timedOut = timed.signal.aborted || (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError"));
        if (!timedOut && err instanceof SyntaxError) throw new JevError("invalid_response", "Jev returned a response that is not valid JSON");
        lastError = new JevError(timedOut ? "timeout" : "network", timedOut ? "Jev request timed out" : "Could not reach Jev");
        continue;
      } finally {
        timed.dispose();
      }

      if (res.ok) {
        const parsed = SystemOneResponseSchema.safeParse(json);
        if (!parsed.success) throw new JevError("invalid_response", "Jev returned a response that does not match the documented shape");
        this.totals.calls++;
        this.totals.input_tokens += parsed.data.usage.input_tokens;
        this.totals.cost_usd += parsed.data.usage.cost ?? 0;
        return parsed.data;
      }

      const detail = await describeError(res);
      lastError = new JevError("http", `Jev returned HTTP ${res.status}${detail ? `: ${detail}` : ""}`, res.status);
      if (!RETRYABLE.has(res.status)) throw lastError;
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 400 + Math.random() * 400;
      if (wait > opts.deadlineMs - (Date.now() - startedAt) - 1500) break;
      await sleep(wait, opts.signal);
    }
    throw lastError ?? new JevError("timeout", "Not enough time remained to call Jev");
  }
}

async function describeError(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { detail?: unknown };
    if (Array.isArray(json.detail)) {
      return json.detail
        .slice(0, 3)
        .map((d: { loc?: unknown[]; msg?: string }) => `${(d.loc ?? []).join(".")} ${d.msg ?? ""}`.trim())
        .join("; ");
    }
    if (typeof json.detail === "string") return json.detail.slice(0, 200);
  } catch {
    // Body was not JSON; the status code is enough.
  }
  return "";
}

export function createJevClient(cfg: { apiKey: string | null; model: string; url: string; timeoutMs: number }): JevClient | null {
  if (!cfg.apiKey) return null;
  return new HttpJevClient(cfg.apiKey, cfg.model, cfg.url, cfg.timeoutMs);
}
