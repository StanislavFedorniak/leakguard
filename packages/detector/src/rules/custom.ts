import type { RuleDefinition } from '../types.js';

export interface CustomRuleInput {
  /** Identifier assigned by the caller (e.g. the database id of the rule). */
  readonly id: string;
  readonly pattern: string;
  readonly caseInsensitive?: boolean;
  /** Prior confidence in [0, 1]. Defaults to 0.6. */
  readonly confidence?: number;
  readonly keywords?: readonly string[];
}

export type CustomRuleError =
  | 'empty-pattern'
  | 'pattern-too-long'
  | 'invalid-syntax'
  | 'unsafe-pattern'
  | 'matches-empty-string'
  | 'invalid-confidence';

export type CompileResult =
  | { readonly ok: true; readonly rule: RuleDefinition }
  | { readonly ok: false; readonly error: CustomRuleError };

export const MAX_CUSTOM_PATTERN_LENGTH = 512;
export const DEFAULT_CUSTOM_CONFIDENCE = 0.6;

/**
 * A quantified group that itself contains a quantifier, e.g. `(a+)+`, `(\w*)*`,
 * `(a{1,9})+`. Such nesting is the classic source of catastrophic backtracking (ReDoS).
 * A heuristic: it rejects some safe patterns, but never accepts the typical unsafe ones.
 */
const NESTED_QUANTIFIER =
  /\((?:[^()\\]|\\.)*(?:[+*]|\{\d+(?:,\d*)?\})(?:[^()\\]|\\.)*\)(?:[+*]|\{\d+(?:,\d*)?\})/;

/** A backreference (`\1`) cannot be matched in linear time either. */
const BACKREFERENCE = /\\[1-9]/;

/** Counts capture groups by matching the empty string against `pattern|`. */
function countCaptureGroups(source: string): number {
  const match = new RegExp(`${source}|`).exec('');
  return match ? match.length - 1 : 0;
}

/**
 * Validates and compiles a user-defined rule. Returns an error code instead of
 * throwing, so the API can show a precise validation message.
 * If the pattern has capture groups, group 1 is treated as the secret.
 */
export function compileCustomRule(input: CustomRuleInput): CompileResult {
  const source = input.pattern;
  if (source.trim().length === 0) {
    return { ok: false, error: 'empty-pattern' };
  }
  if (source.length > MAX_CUSTOM_PATTERN_LENGTH) {
    return { ok: false, error: 'pattern-too-long' };
  }
  const confidence = input.confidence ?? DEFAULT_CUSTOM_CONFIDENCE;
  if (!(confidence >= 0 && confidence <= 1)) {
    return { ok: false, error: 'invalid-confidence' };
  }

  let pattern: RegExp;
  try {
    pattern = new RegExp(source, input.caseInsensitive ? 'i' : '');
  } catch {
    return { ok: false, error: 'invalid-syntax' };
  }
  if (NESTED_QUANTIFIER.test(source) || BACKREFERENCE.test(source)) {
    return { ok: false, error: 'unsafe-pattern' };
  }
  if (pattern.test('')) {
    return { ok: false, error: 'matches-empty-string' };
  }

  return {
    ok: true,
    rule: {
      id: input.id,
      category: 'custom',
      source: 'custom',
      pattern,
      secretGroup: countCaptureGroups(source) > 0 ? 1 : 0,
      confidence,
      ...(input.keywords && input.keywords.length > 0
        ? { keywords: input.keywords.map((keyword) => keyword.toLowerCase()) }
        : {}),
    },
  };
}
