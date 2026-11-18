/**
 * LeakGuard detection engine.
 *
 * Must not depend on Node.js or browser-specific APIs: the same code runs
 * in the scan worker and in the client-side "Check text" page.
 */
export type {
  Detection,
  DetectorOptions,
  RuleCategory,
  RuleDefinition,
  RuleSource,
  ScanInput,
  ScanResult,
  ScoringWeights,
  SeverityThresholds,
  SignalName,
  SignalVector,
  SkipReason,
} from './types.js';
export { SecretValue } from './secret-value.js';
export { BUILTIN_RULES } from './rules/builtin.js';
export {
  compileCustomRule,
  DEFAULT_CUSTOM_CONFIDENCE,
  MAX_CUSTOM_PATTERN_LENGTH,
} from './rules/custom.js';
export type { CompileResult, CustomRuleError, CustomRuleInput } from './rules/custom.js';
export { detectCharset, entropySignal, maxEntropy, shannonEntropy } from './entropy.js';
export type { Charset } from './entropy.js';
export {
  isIgnoredByDefault,
  keywordSignal,
  normalizePath,
  pathSignals,
  placeholderSignal,
} from './context.js';
export type { PathSignals } from './context.js';
export {
  computeScore,
  DEFAULT_MIN_SCORE,
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  SIGNAL_NAMES,
  toSeverity,
} from './scoring.js';
export { maskSecret } from './mask.js';
export {
  createDetector,
  DEFAULT_MAX_CONTENT_LENGTH,
  DEFAULT_MAX_LINE_LENGTH,
  resolveOverlaps,
  scanText,
} from './scanner.js';
export type { Detector } from './scanner.js';
