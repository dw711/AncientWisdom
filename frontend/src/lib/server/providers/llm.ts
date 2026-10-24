import "server-only";
import { z } from "zod";
import { abortAfter, sleep } from "@/lib/server/pipeline/runtime";

export type LlmErrorKind =
  | "unconfigured"
  | "refusal"
  | "truncated"
  | "invalid_output"
  | "timeout"
  | "rate_limited"
  | "auth"
  | "credits"
  | "moderation"
  | "unavailable"
  | "api"
  | "network";

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export interface LlmRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Short identifier for the structured-output schema. */
  schemaName: string;
  effort: "low" | "medium" | "high";
  maxTokens: number;
  signal: AbortSignal;
  timeoutMs: number;
}

export interface LlmResult<T> {
  data: T;
  model: string;
  usage: { input_tokens: number; output_tokens: number; cost_usd: number | null };
}

export interface LlmClient {
  readonly model: string;
  /** Running totals for this client instance (one instance per request). */
  readonly totals?: { calls: number; input_tokens: number; output_tokens: number; cost_usd: number };
  generate<T>(req: LlmRequest<T>): Promise<LlmResult<T>>;
}

/** JSON Schema for OpenRouter's strict `json_schema` response format. */
export function strictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

const ChatResponseSchema = z.object({
  model: z.string(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable(),
        message: z.object({
          content: z.union([z.string(), z.array(z.unknown())]).nullable().optional(),
          refusal: z.string().nullable().optional(),
        }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      cost: z.number().nullable().optional(),
    })
    .optional(),
  error: z.object({ code: z.union([z.number(), z.string()]).optional(), message: z.string().optional() }).optional(),
});

const RETRYABLE = new Set([408, 429, 502, 503]);
const INVALID_BODY = Symbol("invalid-body");

function statusError(status: number, message: string): LlmError {
  switch (status) {
    case 401:
      return new LlmError("auth", "OpenRouter rejected the configured API key");
    case 402:
      return new LlmError("credits", "The OpenRouter account or key has insufficient credits");
    case 403:
      return new LlmError("moderation", "OpenRouter blocked the request (permissions, guardrail or moderation)");
    case 408:
      return new LlmError("timeout", "OpenRouter reported that the request timed out");
    case 429:
      return new LlmError("rate_limited", "OpenRouter is rate limiting requests");
    case 502:
    case 503:
      return new LlmError("unavailable", "No OpenRouter provider for the model is available right now");
    default:
      return new LlmError("api", `OpenRouter returned HTTP ${status}${message ? `: ${message.slice(0, 160)}` : ""}`);
  }
}

/**
 * The application's one LLM adapter: OpenRouter's chat completions endpoint
 * with a strict JSON-schema response format. The key is passed explicitly and
 * never read from a developer's local tooling.
 * https://openrouter.ai/docs/guides/features/structured-outputs
 */
export class OpenRouterLlmClient implements LlmClient {
  readonly totals = { calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly url: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generate<T>(req: LlmRequest<T>): Promise<LlmResult<T>> {
    const body = JSON.stringify({
      model: this.model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.prompt },
      ],
      max_tokens: req.maxTokens,
      // Reasoning counts towards max_tokens; the reasoning text itself is not needed.
      reasoning: { effort: req.effort, exclude: true },
      response_format: { type: "json_schema", json_schema: { name: req.schemaName, strict: true, schema: strictJsonSchema(req.schema) } },
      // Only route to endpoints that honour every parameter, including the schema.
      provider: { require_parameters: true },
    });
    const startedAt = Date.now();
    let lastError: LlmError | null = null;

    // At most one retry, and only for transient statuses when time remains.
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = req.timeoutMs - (Date.now() - startedAt);
      if (remaining < 3000) break;
      // One timer covers the request and the body: OpenRouter sends headers
      // early and keeps the connection open while the model works.
      const timed = abortAfter(remaining, req.signal);
      let res: Response;
      let raw: unknown;
      try {
        res = await this.fetchImpl(this.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "X-OpenRouter-Title": "Historical Figure" },
          body,
          signal: timed.signal,
        });
        raw = await res.json().catch((err: unknown) => {
          if (timed.signal.aborted) throw err;
          return res.ok ? INVALID_BODY : {};
        });
      } catch (err) {
        if (req.signal.aborted) throw new LlmError("timeout", "The model request was cancelled by the deadline");
        const timedOut = timed.signal.aborted || (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError"));
        if (timedOut) throw new LlmError("timeout", "The model took too long to answer");
        lastError = new LlmError("network", "Could not reach OpenRouter");
        continue;
      } finally {
        timed.dispose();
      }

      if (!res.ok) {
        const detail = (raw as { error?: { message?: string } }).error?.message ?? "";
        lastError = statusError(res.status, detail);
        if (!RETRYABLE.has(res.status)) throw lastError;
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 + Math.random() * 500;
        if (wait > req.timeoutMs - (Date.now() - startedAt) - 5000) break;
        await sleep(wait, req.signal);
        continue;
      }
      if (raw === INVALID_BODY) throw new LlmError("invalid_output", "OpenRouter returned a response that is not valid JSON");

      const parsed = ChatResponseSchema.safeParse(raw);
      if (!parsed.success) throw new LlmError("invalid_output", "OpenRouter returned a response that does not match the chat completion shape");
      const data = parsed.data;
      if (data.error) throw new LlmError("api", `The model failed while generating: ${data.error.message ?? "unknown error"}`);
      const choice = data.choices[0];
      if (choice.message.refusal) throw new LlmError("refusal", "The model declined this request");
      if (choice.finish_reason === "content_filter") throw new LlmError("refusal", "The provider's content filter stopped the answer");
      if (choice.finish_reason === "length") throw new LlmError("truncated", "The model's answer was cut off before it was complete");
      if (choice.finish_reason === "error") throw new LlmError("api", "The model reported an error while generating");
      const content = typeof choice.message.content === "string" ? choice.message.content : "";
      let json: unknown;
      try {
        json = JSON.parse(content);
      } catch {
        throw new LlmError("invalid_output", "The model's answer was not valid JSON");
      }
      this.totals.calls++;
      this.totals.input_tokens += data.usage?.prompt_tokens ?? 0;
      this.totals.output_tokens += data.usage?.completion_tokens ?? 0;
      this.totals.cost_usd += data.usage?.cost ?? 0;
      const validated = req.schema.safeParse(json);
      if (!validated.success) throw new LlmError("invalid_output", "The model's answer did not match the required structure");
      return {
        data: validated.data,
        model: data.model,
        usage: {
          input_tokens: data.usage?.prompt_tokens ?? 0,
          output_tokens: data.usage?.completion_tokens ?? 0,
          cost_usd: data.usage?.cost ?? null,
        },
      };
    }
    throw lastError ?? new LlmError("timeout", "Not enough time remained to call the model");
  }
}

export function createLlmClient(cfg: { apiKey: string | null; model: string; url: string }): LlmClient | null {
  if (!cfg.apiKey) return null;
  return new OpenRouterLlmClient(cfg.apiKey, cfg.model, cfg.url);
}
