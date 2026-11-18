import { describe, expect, it } from 'vitest';
import {
  computeScore,
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  SIGNAL_NAMES,
  toSeverity,
} from '../src/scoring.js';
import type { SignalVector } from '../src/types.js';

const zero: SignalVector = {
  ruleConfidence: 0,
  entropy: 0,
  sensitivePath: 0,
  keyword: 0,
  testPath: 0,
  placeholder: 0,
};

describe('computeScore', () => {
  it('is the weighted sum of signals', () => {
    const signals = { ...zero, ruleConfidence: 1, entropy: 0.5 };
    expect(computeScore(signals, DEFAULT_WEIGHTS)).toBeCloseTo(0.7 + 0.125, 4);
  });

  it('is clamped to [0, 1]', () => {
    const all = Object.fromEntries(SIGNAL_NAMES.map((n) => [n, 1])) as unknown as SignalVector;
    const ones = { ...DEFAULT_WEIGHTS, testPath: 0, placeholder: 0 };
    expect(computeScore(all, ones)).toBe(1);
    expect(computeScore({ ...zero, placeholder: 1 }, DEFAULT_WEIGHTS)).toBe(0);
  });

  it('negative signals lower the score', () => {
    const base = { ...zero, ruleConfidence: 0.9, entropy: 1 };
    const inTest = { ...base, testPath: 1 };
    expect(computeScore(inTest, DEFAULT_WEIGHTS)).toBeLessThan(computeScore(base, DEFAULT_WEIGHTS));
  });

  it('every signal has a weight', () => {
    expect(Object.keys(DEFAULT_WEIGHTS).toSorted()).toEqual(SIGNAL_NAMES.toSorted());
  });
});

describe('toSeverity', () => {
  it.each([
    [0, 'low'],
    [0.44, 'low'],
    [0.45, 'medium'],
    [0.65, 'high'],
    [0.85, 'critical'],
    [1, 'critical'],
  ] as const)('%d → %s', (score, severity) => {
    expect(toSeverity(score, DEFAULT_THRESHOLDS)).toBe(severity);
  });

  it('thresholds are ordered', () => {
    expect(DEFAULT_THRESHOLDS.medium).toBeLessThan(DEFAULT_THRESHOLDS.high);
    expect(DEFAULT_THRESHOLDS.high).toBeLessThan(DEFAULT_THRESHOLDS.critical);
  });
});
