import { isIgnoredByDefault, keywordSignal, pathSignals, placeholderSignal } from './context.js';
import type { PathSignals } from './context.js';
import { entropySignal, shannonEntropy } from './entropy.js';
import { buildLineIndex, locate } from './line-index.js';
import { maskSecret } from './mask.js';
import { BUILTIN_RULES } from './rules/builtin.js';
import {
  computeScore,
  DEFAULT_MIN_SCORE,
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  toSeverity,
} from './scoring.js';
import { SecretValue } from './secret-value.js';
import type {
  Detection,
  DetectorOptions,
  RuleDefinition,
  ScanInput,
  ScanResult,
  ScoringWeights,
  SeverityThresholds,
  SignalVector,
} from './types.js';

export const DEFAULT_MAX_CONTENT_LENGTH = 1024 * 1024;
export const DEFAULT_MAX_LINE_LENGTH = 4096;
/** Only the beginning of a file is checked for NUL bytes, like Git does. */
const BINARY_PROBE_LENGTH = 8192;
/** Characters to the left of a secret on its line that are searched for a keyword. */
const CONTEXT_WINDOW = 80;

/** A rule prepared for scanning: the pattern is recompiled with the `g` and `d` flags. */
interface CompiledRule {
  readonly rule: RuleDefinition;
  readonly regex: RegExp;
}

/** A match before overlap resolution. */
type Candidate = Detection;

export interface Detector {
  scan(input: ScanInput): ScanResult;
  /** Rules that are active with the given options. */
  readonly rules: readonly RuleDefinition[];
}

function compile(rule: RuleDefinition): CompiledRule {
  const flags = new Set([...rule.pattern.flags.split(''), 'g', 'd']);
  return { rule, regex: new RegExp(rule.pattern.source, [...flags].join('')) };
}

function hasKeyword(rule: RuleDefinition, lowerText: string): boolean {
  return !rule.keywords || rule.keywords.some((keyword) => lowerText.includes(keyword));
}

function isBinary(content: string): boolean {
  return content.slice(0, BINARY_PROBE_LENGTH).includes('\0');
}

/** Yields every line without its terminator ("\n" or "\r\n") and its start offset. */
function* iterateLines(
  content: string,
  lineStarts: readonly number[],
): Generator<{ text: string; start: number }> {
  for (let i = 0; i < lineStarts.length; i++) {
    const start = lineStarts[i] ?? 0;
    const next = lineStarts[i + 1];
    const text = content.slice(start, next === undefined ? undefined : next - 1);
    yield { text: text.endsWith('\r') ? text.slice(0, -1) : text, start };
  }
}

/** Runs one rule on `text`, which starts at `baseOffset` in the content. */
function* matchRule(
  { rule, regex }: CompiledRule,
  text: string,
  baseOffset: number,
): Generator<{ secret: string; startOffset: number }> {
  const group = rule.secretGroup ?? 0;
  for (const match of text.matchAll(regex)) {
    const raw = match[group];
    const span = match.indices?.[group];
    if (raw === undefined || span === undefined) {
      continue;
    }
    // Surrounding whitespace is not part of the secret (a PEM body starts with "\n").
    const secret = raw.trim();
    if (secret.length > 0) {
      const leading = raw.length - raw.trimStart().length;
      yield { secret, startOffset: baseOffset + span[0] + leading };
    }
  }
}

/**
 * Greedy overlap resolution: candidates are taken in descending score order and
 * a candidate is kept only if its span does not intersect an already kept one.
 * So a specific rule (high prior) wins over the generic one on the same value.
 * The result is ordered by position.
 */
export function resolveOverlaps(candidates: readonly Candidate[]): Candidate[] {
  const byScore = candidates.toSorted(
    (a, b) =>
      b.score - a.score ||
      b.signals.ruleConfidence - a.signals.ruleConfidence ||
      a.startOffset - b.startOffset,
  );
  const kept: Candidate[] = [];
  for (const candidate of byScore) {
    const overlaps = kept.some(
      (other) => candidate.startOffset < other.endOffset && other.startOffset < candidate.endOffset,
    );
    if (!overlaps) {
      kept.push(candidate);
    }
  }
  return kept.toSorted((a, b) => a.startOffset - b.startOffset);
}

/**
 * Creates a detector with a fixed configuration. Rules are compiled once and
 * reused for every scanned file, which matters when a scan covers thousands of files.
 */
export function createDetector(options: DetectorOptions = {}): Detector {
  const disabled = new Set(options.disabledRuleIds ?? []);
  const rules = [
    ...BUILTIN_RULES.filter((rule) => !disabled.has(rule.id)),
    ...(options.customRules ?? []),
  ];
  const compiled = rules.map(compile);
  const weights: ScoringWeights = { ...DEFAULT_WEIGHTS, ...options.weights };
  const thresholds: SeverityThresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const maxContentLength = options.maxContentLength ?? DEFAULT_MAX_CONTENT_LENGTH;
  const maxLineLength = options.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH;

  function evaluate(
    rule: RuleDefinition,
    secret: string,
    startOffset: number,
    content: string,
    lineStarts: readonly number[],
    paths: PathSignals,
  ): Candidate | null {
    if (
      rule.minEntropy !== undefined &&
      shannonEntropy(secret.replace(/\s+/g, '')) < rule.minEntropy
    ) {
      return null;
    }
    const start = locate(lineStarts, startOffset);
    const lineStart = startOffset - start.column + 1;
    // Single-line rules look for a keyword only on the secret's own line. Multi-line
    // rules may cross lines: a PEM body follows its "BEGIN ... PRIVATE KEY" header.
    const contextStart = rule.multiline
      ? Math.max(0, startOffset - CONTEXT_WINDOW)
      : Math.max(lineStart, startOffset - CONTEXT_WINDOW);
    const signals: SignalVector = {
      ruleConfidence: rule.confidence,
      entropy: entropySignal(secret),
      sensitivePath: paths.sensitivePath,
      keyword: keywordSignal(content.slice(contextStart, startOffset)),
      testPath: paths.testPath,
      placeholder: placeholderSignal(secret),
    };
    const score = computeScore(signals, weights);
    if (score < minScore) {
      return null;
    }
    const endOffset = startOffset + secret.length;
    const end = locate(lineStarts, endOffset);
    return {
      ruleId: rule.id,
      category: rule.category,
      severity: toSeverity(score, thresholds),
      score,
      signals,
      line: start.line,
      column: start.column,
      endLine: end.line,
      endColumn: end.column,
      startOffset,
      endOffset,
      maskedPreview: maskSecret(secret, rule.knownPrefixes),
      secret: new SecretValue(secret),
    };
  }

  function scan(input: ScanInput): ScanResult {
    const { path, content } = input;
    if (isIgnoredByDefault(path)) {
      return { detections: [], skipped: 'ignored-path', skippedLongLines: 0 };
    }
    if (content.length > maxContentLength) {
      return { detections: [], skipped: 'too-large', skippedLongLines: 0 };
    }
    if (isBinary(content)) {
      return { detections: [], skipped: 'binary', skippedLongLines: 0 };
    }

    // File-level keyword pre-filter: most files contain no keyword of most rules.
    const lowerContent = content.toLowerCase();
    const applicable = compiled.filter(({ rule }) => hasKeyword(rule, lowerContent));
    if (applicable.length === 0) {
      return { detections: [], skipped: null, skippedLongLines: 0 };
    }

    const paths = pathSignals(path);
    const lineStarts = buildLineIndex(content);
    const candidates: Candidate[] = [];
    const collect = (rule: RuleDefinition, secret: string, startOffset: number): void => {
      const candidate = evaluate(rule, secret, startOffset, content, lineStarts, paths);
      if (candidate) {
        candidates.push(candidate);
      }
    };

    const multiline = applicable.filter(({ rule }) => rule.multiline);
    const singleLine = applicable.filter(({ rule }) => !rule.multiline);

    for (const entry of multiline) {
      for (const { secret, startOffset } of matchRule(entry, content, 0)) {
        collect(entry.rule, secret, startOffset);
      }
    }

    let skippedLongLines = 0;
    for (const { text, start } of iterateLines(content, lineStarts)) {
      if (text.length > maxLineLength) {
        skippedLongLines++;
        continue;
      }
      const lowerLine = text.toLowerCase();
      for (const entry of singleLine.filter(({ rule }) => hasKeyword(rule, lowerLine))) {
        for (const { secret, startOffset } of matchRule(entry, text, start)) {
          collect(entry.rule, secret, startOffset);
        }
      }
    }

    return { detections: resolveOverlaps(candidates), skipped: null, skippedLongLines };
  }

  return { scan, rules };
}

/** Convenience wrapper for one-off scans (e.g. the "Check text" page). */
export function scanText(input: ScanInput, options: DetectorOptions = {}): ScanResult {
  return createDetector(options).scan(input);
}
