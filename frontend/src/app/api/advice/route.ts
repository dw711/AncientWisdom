import type { NextRequest } from "next/server";
import type { AdviceStreamEvent, ApiError } from "@/lib/contracts/advice";
import { getAdvice } from "@/lib/server/advice-service";
import { loadConfig } from "@/lib/server/config";
import { rateLimit } from "@/lib/server/rate-limit";

/** Above the 180 s pipeline deadline, within Vercel's 300 s limit on every plan. */
export const maxDuration = 200;

const MAX_BODY_BYTES = 20_000;

function errorResponse(requestId: string, status: number, code: ApiError["error"]["code"], message: string, headers: Record<string, string> = {}) {
  const body: ApiError = { request_id: requestId, error: { code, message } };
  return Response.json(body, { status, headers: { "X-Request-Id": requestId, ...headers } });
}

export async function POST(request: NextRequest) {
  const requestId = `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const config = loadConfig();

  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  // Preview requests make no provider calls, so they can be allowed more often.
  const max = config.mode === "demo" ? config.rateLimit.max * 5 : config.rateLimit.max;
  const limit = rateLimit(`advice:${client}`, max, config.rateLimit.windowMs);
  if (!limit.ok) {
    return errorResponse(requestId, 429, "rate_limited", "Too many requests. Please wait a moment and try again.", {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return errorResponse(requestId, 413, "payload_too_large", "The request is too large.");
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return errorResponse(requestId, 400, "invalid_request", "The request body must be JSON.");
  }

  const wantsStream = request.headers.get("accept")?.includes("application/x-ndjson");
  if (!wantsStream) {
    const result = await getAdvice(input, { requestId, signal: request.signal });
    return Response.json(result.body, { status: result.httpStatus, headers: { "X-Request-Id": requestId, "Cache-Control": "no-store" } });
  }

  // Stream honest stage messages, then the single validated result. Advice is
  // never streamed before validation has finished.
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AdviceStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // The client went away; the abort signal stops the pipeline.
        }
      };
      send({ type: "progress", stage: "received", message: "Reading your description" });
      const result = await getAdvice(input, {
        requestId,
        signal: abort.signal,
        onProgress: (stage, message) => send({ type: "progress", stage, message }),
      });
      if ("error" in result.body) send({ type: "error", http_status: result.httpStatus, error: result.body });
      else send({ type: "result", http_status: result.httpStatus, response: result.body });
      try {
        controller.close();
      } catch {
        // Already closed by a cancelled client.
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}
