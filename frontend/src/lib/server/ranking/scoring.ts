import type { AnalogyRating, Dimension, DimensionScore } from "@/lib/contracts/advice";
import { RUBRIC } from "./rubric";

export const TOP_LEVEL = 4;

/**
 * analogy_fit = round(100 × Σ weight × (score / 4)).
 * The weights are an application heuristic, not something Jev supplies or validates.
 */
export function computeAnalogyFit(scores: Record<Dimension, number>, weights: Record<Dimension, number>): number {
  let total = 0;
  for (const d of Object.keys(weights) as Dimension[]) {
    const normalised = Math.min(1, Math.max(0, scores[d] / TOP_LEVEL));
    total += weights[d] * normalised;
  }
  return Math.round(100 * total);
}

export interface Thresholds {
  minAnalogyFit: number;
  criticalMismatch: number;
  structuralFloor: number;
  lowConfidence: number;
}

/**
 * Independent eligibility gates: a high weighted score cannot compensate for
 * missing evidence, a critical mismatch or an incompatible decision structure.
 */
export function buildRating(input: {
  dimensions: DimensionScore[];
  weights: Record<Dimension, number>;
  criticalMismatch: number | null;
  evidenceOk: boolean;
  thresholds: Thresholds;
  source: "jev" | "sample";
}): AnalogyRating {
  const byDim = Object.fromEntries(input.dimensions.map((d) => [d.dimension, d.raw_score])) as Record<Dimension, number>;
  const analogy_fit = computeAnalogyFit(byDim, input.weights);
  const reasons: string[] = [];
  if (!input.evidenceOk) reasons.push("Not enough approved evidence is stored for this case.");
  if (input.criticalMismatch !== null && input.criticalMismatch >= input.thresholds.criticalMismatch) {
    reasons.push("A critical mismatch with your situation makes this comparison misleading.");
  }
  const structural = input.dimensions.find((d) => d.dimension === "structural");
  if (structural && structural.normalised < input.thresholds.structuralFloor) {
    reasons.push("The underlying decision structure is too different.");
  }
  if (analogy_fit < input.thresholds.minAnalogyFit) reasons.push("The overall fit is too weak to draw a lesson from.");
  return {
    analogy_fit,
    source: input.source,
    dimensions: input.dimensions,
    weights: input.weights,
    critical_mismatch_probability: input.criticalMismatch,
    low_confidence: input.dimensions.some((d) => d.confidence !== null && d.confidence < input.thresholds.lowConfidence),
    eligible: reasons.length === 0,
    ineligible_reasons: reasons,
  };
}

/** Builds a sample (non-Jev) dimension score for prewritten demo output. */
export function sampleDimension(dimension: Dimension, level: number): DimensionScore {
  const rubric = RUBRIC.find((r) => r.dimension === dimension)!;
  return {
    dimension,
    label: rubric.label,
    raw_score: level,
    normalised: level / TOP_LEVEL,
    confidence: null,
    probabilities: null,
    legend: Object.fromEntries(rubric.levels.map((text, i) => [String(i), text])),
  };
}
