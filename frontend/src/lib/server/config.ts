import "server-only";
import type { Dimension, Mode } from "@/lib/contracts/advice";

export const PIPELINE_VERSION = "pipeline-2026-10-24.1";

export const DEFAULT_WEIGHTS: Record<Dimension, number> = {
  structural: 0.45,
  incentives: 0.25,
  constraints: 0.2,
  time: 0.1,
};

export interface AppConfig {
  mode: Mode;
  corpusDir: string;
  /** Live mode reads PostgreSQL when DATABASE_URL is set; preview mode always uses the JSON seed. */
  corpusSource: "postgres" | "json";
  databaseUrl: string | null;
  corpusVersionPin: string | null;
  corpusCacheMs: number;
  deadlineMs: number;
  jev: {
    apiKey: string | null;
    model: string;
    url: string;
    batchSize: number;
    concurrency: number;
    timeoutMs: number;
  };
  llm: {
    apiKey: string | null;
    model: string;
    url: string;
    extractionEffort: "low" | "medium" | "high";
    synthesisEffort: "low" | "medium" | "high";
    timeoutMs: number;
    /** The profile normally takes ~12 s; past this, ranking proceeds on the user's own words. */
    profileTimeoutMs: number;
  };
  weights: Record<Dimension, number>;
  weightsVersion: string;
  thresholds: {
    minAnalogyFit: number;
    criticalMismatch: number;
    structuralFloor: number;
    challenge: number;
    lowConfidence: number;
    supportConfidence: number;
    contradiction: number;
  };
  rateLimit: { windowMs: number; max: number };
}

function num(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = value === undefined || value.trim() === "" ? NaN : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function secret(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith("replace-with")) return null;
  return trimmed;
}

function effort(value: string | undefined, fallback: "low" | "medium" | "high") {
  return value === "low" || value === "medium" || value === "high" ? value : fallback;
}

/** Parses ANALOGY_WEIGHTS ("structural=0.45,incentives=0.25,...") and renormalises to sum to 1. */
export function parseWeights(raw: string | undefined): Record<Dimension, number> {
  if (!raw) return { ...DEFAULT_WEIGHTS };
  const weights = { ...DEFAULT_WEIGHTS };
  for (const part of raw.split(",")) {
    const [key, value] = part.split("=").map((s) => s.trim());
    if (key in weights && Number.isFinite(Number(value)) && Number(value) >= 0) {
      weights[key as Dimension] = Number(value);
    }
  }
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total <= 0) return { ...DEFAULT_WEIGHTS };
  for (const key of Object.keys(weights) as Dimension[]) weights[key] = Math.round((weights[key] / total) * 10_000) / 10_000;
  return weights;
}

export function weightsVersion(weights: Record<Dimension, number>): string {
  const w = (d: Dimension) => weights[d].toFixed(2);
  return `weights-s${w("structural")}-i${w("incentives")}-c${w("constraints")}-t${w("time")}`;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const weights = parseWeights(env.ANALOGY_WEIGHTS);
  return {
    mode: env.APP_MODE === "live" ? "live" : "demo",
    corpusDir: env.CORPUS_DIR?.trim() || "seed-v0.1.0",
    corpusSource: env.CORPUS_SOURCE === "json" || !secret(env.DATABASE_URL) ? "json" : "postgres",
    databaseUrl: secret(env.DATABASE_URL),
    corpusVersionPin: env.CORPUS_VERSION?.trim() || null,
    corpusCacheMs: num(env.CORPUS_CACHE_SECONDS, 300, 0, 86_400) * 1000,
    // Measured live (Gemini 3.8 Flash): profile ~5 s, Jev under 1 s per call, one write ~35 s.
    deadlineMs: num(env.PIPELINE_DEADLINE_MS, 180_000, 10_000, 300_000),
    // Both providers are billed through one OpenRouter key.
    jev: {
      apiKey: secret(env.OPENROUTER_API_KEY),
      model: env.JEV_MODEL?.trim() || "typesafe/jev-1.14",
      url: env.JEV_API_URL?.trim() || "https://openrouter.ai/api/v1/systemone",
      batchSize: num(env.JEV_BATCH_SIZE, 3, 1, 8),
      concurrency: num(env.JEV_CONCURRENCY, 3, 1, 6),
      timeoutMs: num(env.JEV_TIMEOUT_MS, 20_000, 2_000, 60_000),
    },
    llm: {
      apiKey: secret(env.OPENROUTER_API_KEY),
      model: env.LLM_MODEL?.trim() || "google/gemini-3.8-flash",
      url: env.LLM_API_URL?.trim() || "https://openrouter.ai/api/v1/chat/completions",
      extractionEffort: effort(env.LLM_EXTRACTION_EFFORT, "low"),
      synthesisEffort: effort(env.LLM_SYNTHESIS_EFFORT, "low"),
      timeoutMs: num(env.LLM_TIMEOUT_MS, 120_000, 5_000, 240_000),
      profileTimeoutMs: num(env.LLM_PROFILE_TIMEOUT_MS, 45_000, 5_000, 120_000),
    },
    weights,
    weightsVersion: weightsVersion(weights),
    thresholds: {
      minAnalogyFit: num(env.MIN_ANALOGY_FIT, 45, 0, 100),
      criticalMismatch: num(env.CRITICAL_MISMATCH_THRESHOLD, 0.6, 0, 1),
      structuralFloor: num(env.STRUCTURAL_FLOOR, 0.4, 0, 1),
      challenge: num(env.CHALLENGE_THRESHOLD, 0.6, 0, 1),
      lowConfidence: 0.35,
      supportConfidence: 0.5,
      contradiction: 0.7,
    },
    rateLimit: {
      windowMs: num(env.RATE_LIMIT_WINDOW_MS, 5 * 60_000, 1_000, 3_600_000),
      max: num(env.RATE_LIMIT_MAX, 20, 1, 10_000),
    },
  };
}
