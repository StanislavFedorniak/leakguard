import type { Severity } from '@leakguard/shared';
import type { SecretValue } from './secret-value.js';

/** A single file (or any text blob) to scan. */
export interface ScanInput {
  /** Repository-relative path. Used for context heuristics only. */
  readonly path: string;
  readonly content: string;
}

export type RuleCategory =
  | 'vcs-token'
  | 'cloud-key'
  | 'payment-key'
  | 'chat-token'
  | 'jwt'
  | 'private-key'
  | 'connection-string'
  | 'generic'
  | 'custom';

export type RuleSource = 'builtin' | 'custom';

/** A detection rule: a regular expression plus metadata used for scoring. */
export interface RuleDefinition {
  /** Stable identifier. Also used as an i18n key for remediation advice on the client. */
  readonly id: string;
  readonly category: RuleCategory;
  readonly source: RuleSource;
  /**
   * Pattern to search for. The engine recompiles it with the `g` and `d` flags,
   * so callers do not need to set them.
   */
  readonly pattern: RegExp;
  /** Capture group that holds the secret itself. Defaults to the whole match (0). */
  readonly secretGroup?: number;
  /**
   * Lower-case substrings at least one of which must be present for the rule
   * to run on a file or a line. A cheap pre-filter that skips most regex work.
   */
  readonly keywords?: readonly string[];
  /** Prior confidence that a match of this pattern is a real secret, in [0, 1]. */
  readonly confidence: number;
  /** Known token prefixes kept visible in the masked preview (e.g. `ghp_`). */
  readonly knownPrefixes?: readonly string[];
  /** Hard gate: matches with lower Shannon entropy (bits per character) are discarded. */
  readonly minEntropy?: number;
  /** The pattern may span several lines (e.g. PEM blocks); it runs on the whole content. */
  readonly multiline?: boolean;
}

/** Normalized signals, each in [0, 1], that feed the scoring model. */
export interface SignalVector {
  /** Prior confidence of the rule that matched. */
  readonly ruleConfidence: number;
  /** Normalized Shannon entropy of the secret. */
  readonly entropy: number;
  /** The file path looks like a configuration or secrets file. */
  readonly sensitivePath: number;
  /** A secret-like variable name precedes the value. */
  readonly keyword: number;
  /** The file path looks like a test, fixture or example. */
  readonly testPath: number;
  /** The value looks like a placeholder or a reference to another variable. */
  readonly placeholder: number;
}

export type SignalName = keyof SignalVector;

/** Weights wᵢ of the linear scoring model `score = Σ wᵢ·sᵢ`. */
export type ScoringWeights = Readonly<Record<SignalName, number>>;

/** Lower bounds of the score for each severity above `low`. */
export interface SeverityThresholds {
  readonly medium: number;
  readonly high: number;
  readonly critical: number;
}

/** One detected secret occurrence. */
export interface Detection {
  readonly ruleId: string;
  readonly category: RuleCategory;
  readonly severity: Severity;
  /** Aggregated score in [0, 1]. */
  readonly score: number;
  readonly signals: SignalVector;
  /** 1-based line of the first character of the secret. */
  readonly line: number;
  /** 1-based column of the first character of the secret. */
  readonly column: number;
  /** 1-based line of the character right after the secret. */
  readonly endLine: number;
  /** 1-based column of the character right after the secret (exclusive end). */
  readonly endColumn: number;
  /** 0-based offsets of the secret in the content, `[start, end)`. */
  readonly startOffset: number;
  readonly endOffset: number;
  /** Safe preview, e.g. `ghp_****abcd`. */
  readonly maskedPreview: string;
  /** The raw secret. Lives only in memory: it never serializes to JSON or strings. */
  readonly secret: SecretValue;
}

export type SkipReason = 'ignored-path' | 'binary' | 'too-large';

export interface ScanResult {
  readonly detections: Detection[];
  /** Why the input was not scanned at all, or `null` when it was scanned. */
  readonly skipped: SkipReason | null;
  /** Lines skipped because they exceed `maxLineLength` (minified code, data blobs). */
  readonly skippedLongLines: number;
}

export interface DetectorOptions {
  /** Built-in rule identifiers to switch off. */
  readonly disabledRuleIds?: readonly string[];
  /** Additional rules, typically compiled with `compileCustomRule`. */
  readonly customRules?: readonly RuleDefinition[];
  readonly weights?: Partial<ScoringWeights>;
  readonly thresholds?: Partial<SeverityThresholds>;
  /** Detections with a lower score are dropped. */
  readonly minScore?: number;
  /** Inputs longer than this (in characters) are skipped. */
  readonly maxContentLength?: number;
  /** Lines longer than this (in characters) are not matched by single-line rules. */
  readonly maxLineLength?: number;
}
