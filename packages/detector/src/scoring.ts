import type { Severity } from '@leakguard/shared';
import { clamp } from './math.js';
import type { ScoringWeights, SeverityThresholds, SignalName, SignalVector } from './types.js';

export const SIGNAL_NAMES: readonly SignalName[] = [
  'ruleConfidence',
  'entropy',
  'sensitivePath',
  'keyword',
  'testPath',
  'placeholder',
];

/**
 * Initial weights of the linear model. Positive signals raise the score,
 * negative ones (test files, placeholders) lower it. These are starting values;
 * they are calibrated by grid search on the labeled corpus (issue #5).
 */
export const DEFAULT_WEIGHTS: ScoringWeights = {
  ruleConfidence: 0.7,
  entropy: 0.25,
  sensitivePath: 0.15,
  keyword: 0.15,
  testPath: -0.35,
  // Strong enough to cancel a specific rule plus a keyword: documented example keys
  // (e.g. the AWS docs key ending in EXAMPLE) must not be reported.
  placeholder: -0.8,
};

export const DEFAULT_THRESHOLDS: SeverityThresholds = {
  medium: 0.45,
  high: 0.65,
  critical: 0.85,
};

/** Detections below this score are treated as noise and dropped. */
export const DEFAULT_MIN_SCORE = 0.3;

/** score = clamp(Σ wᵢ·sᵢ, 0, 1), rounded to 4 decimals for stable output. */
export function computeScore(signals: SignalVector, weights: ScoringWeights): number {
  let sum = 0;
  for (const name of SIGNAL_NAMES) {
    sum += weights[name] * signals[name];
  }
  return Math.round(clamp(sum) * 10_000) / 10_000;
}

export function toSeverity(score: number, thresholds: SeverityThresholds): Severity {
  if (score >= thresholds.critical) {
    return 'critical';
  }
  if (score >= thresholds.high) {
    return 'high';
  }
  if (score >= thresholds.medium) {
    return 'medium';
  }
  return 'low';
}
