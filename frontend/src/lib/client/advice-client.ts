import type { AdviceRequestInput, AdviceResponse, AdviceStreamEvent, ApiError, ProgressStage } from "@/lib/contracts/advice";

export type AdviceOutcome =
  | { ok: true; response: AdviceResponse }
  | { ok: false; httpStatus: number; error: ApiError["error"]; requestId: string | null };

const connectionLost = (status = 0): AdviceOutcome => ({
  ok: false,
  httpStatus: status,
  requestId: null,
  error: { code: "internal_error", message: "The connection was interrupted before the analysis finished. Your description is still here; please try again." },
});

/** Posts a request and reads the NDJSON progress stream until the validated result arrives. */
export async function requestAdvice(
  body: AdviceRequestInput,
  opts: { signal: AbortSignal; onProgress: (stage: ProgressStage, message: string) => void },
): Promise<AdviceOutcome> {
  let res: Response;
  try {
    res = await fetch("/api/advice", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    if (opts.signal.aborted) throw err;
    return connectionLost();
  }

  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("ndjson")) {
    const json = (await res.json().catch(() => null)) as ApiError | AdviceResponse | null;
    if (json && "error" in json) return { ok: false, httpStatus: res.status, error: json.error, requestId: json.request_id };
    if (json && "status" in json) return { ok: true, response: json };
    return connectionLost(res.status);
  }

  const reader = res.body?.getReader();
  if (!reader) return connectionLost(res.status);
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch (err) {
      if (opts.signal.aborted) throw err;
      return connectionLost(res.status);
    }
    if (chunk.value) buffer += decoder.decode(chunk.value, { stream: !chunk.done });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line) continue;
      let event: AdviceStreamEvent;
      try {
        event = JSON.parse(line) as AdviceStreamEvent;
      } catch {
        continue;
      }
      if (event.type === "progress") opts.onProgress(event.stage, event.message);
      else if (event.type === "result") return { ok: true, response: event.response };
      else if (event.type === "error") return { ok: false, httpStatus: event.http_status, error: event.error.error, requestId: event.error.request_id };
    }
    if (chunk.done) return connectionLost(res.status);
  }
}
