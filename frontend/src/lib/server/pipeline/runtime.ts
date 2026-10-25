/**
 * Small runtime helpers shared by the pipeline stages: one overall deadline,
 * bounded concurrency and a single bounded retry.
 */

export class DeadlineExceededError extends Error {
  constructor(stage: string) {
    super(`Deadline exceeded during ${stage}`);
    this.name = "DeadlineExceededError";
  }
}

export interface TimedSignal {
  signal: AbortSignal;
  /** Clears the timer and parent listeners once the guarded work has finished. */
  dispose(): void;
}

/**
 * A signal that aborts after `ms` or when any parent aborts. Built on
 * setTimeout rather than AbortSignal.any(AbortSignal.timeout(...)): on Node 20
 * the latter's timeout signal can be garbage-collected before it fires, which
 * left requests hanging in a long-running server.
 */
export function abortAfter(ms: number, ...parents: (AbortSignal | undefined)[]): TimedSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("The operation timed out.", "TimeoutError")), Math.max(1, ms));
  const cleanups: (() => void)[] = [];
  for (const parent of parents) {
    if (!parent) continue;
    if (parent.aborted) {
      controller.abort(parent.reason);
      break;
    }
    const onAbort = () => controller.abort(parent.reason);
    parent.addEventListener("abort", onAbort, { once: true });
    cleanups.push(() => parent.removeEventListener("abort", onAbort));
  }
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      for (const c of cleanups) c();
    },
  };
}

export interface Deadline {
  signal: AbortSignal;
  remainingMs(): number;
  ensure(stage: string, minimumMs?: number): void;
}

export function createDeadline(totalMs: number, parent?: AbortSignal, now: () => number = Date.now): Deadline {
  const startedAt = now();
  // Lives for the whole request; the timer is short-lived relative to the process.
  const { signal } = abortAfter(totalMs, parent);
  return {
    signal,
    remainingMs: () => Math.max(0, totalMs - (now() - startedAt)),
    ensure(stage: string, minimumMs = 0) {
      if (signal.aborted || totalMs - (now() - startedAt) < minimumMs) throw new DeadlineExceededError(stage);
    },
  };
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export class Stopwatch {
  private readonly started = Date.now();
  readonly timings: Record<string, number> = {};
  private last = this.started;

  lap(stage: string) {
    const t = Date.now();
    this.timings[stage] = (this.timings[stage] ?? 0) + (t - this.last);
    this.last = t;
  }

  total() {
    this.timings.total = Date.now() - this.started;
    return this.timings;
  }
}
