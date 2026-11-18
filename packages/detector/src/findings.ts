import { SEVERITIES } from '@leakguard/shared';
import type { Severity } from '@leakguard/shared';
import { fingerprintSecret } from './fingerprint.js';
import type { Fingerprinter } from './fingerprint.js';
import type { Detection, RuleCategory } from './types.js';

/** A detection together with where it was found. */
export interface LocatedDetection {
  readonly path: string;
  /** Commit that introduced or contains the occurrence; absent for working-tree scans. */
  readonly commitSha?: string;
  readonly detection: Detection;
}

export interface FindingOccurrence {
  readonly path: string;
  readonly commitSha?: string;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly ruleId: string;
  readonly score: number;
  readonly severity: Severity;
}

/**
 * One secret, possibly seen in many files and commits. Rule, severity, score and preview
 * are taken from its strongest occurrence. Contains no raw secret.
 */
export interface FindingCandidate {
  readonly fingerprint: string;
  readonly ruleId: string;
  readonly category: RuleCategory;
  readonly severity: Severity;
  readonly score: number;
  readonly maskedPreview: string;
  /** The fingerprint was marked as a false positive earlier: keep for audit, do not alert. */
  readonly suppressed: boolean;
  readonly occurrences: readonly FindingOccurrence[];
}

export interface GroupOptions {
  readonly fingerprinter: Fingerprinter;
  /** Fingerprints of findings marked as `false_positive`. */
  readonly suppressedFingerprints?: ReadonlySet<string>;
}

interface Group {
  best: Detection;
  readonly occurrences: Map<string, FindingOccurrence>;
}

export function severityRank(severity: Severity): number {
  return SEVERITIES.indexOf(severity);
}

function occurrenceKey(item: LocatedDetection): string {
  const { detection } = item;
  return `${item.commitSha ?? ''}\u0000${item.path}\u0000${detection.line}:${detection.column}`;
}

/**
 * Deduplicates detections: all occurrences of the same secret (same fingerprint)
 * across files and commits become one candidate. Runs in O(n) with a hash map.
 * The same location reported twice (e.g. a re-scan of a commit) is kept once.
 * Candidates are ordered by severity, then score, both descending.
 */
export function groupDetections(
  items: Iterable<LocatedDetection>,
  options: GroupOptions,
): FindingCandidate[] {
  const groups = new Map<string, Group>();

  for (const item of items) {
    const { detection } = item;
    const fingerprint = fingerprintSecret(detection.secret, options.fingerprinter);
    let group = groups.get(fingerprint);
    if (!group) {
      group = { best: detection, occurrences: new Map() };
      groups.set(fingerprint, group);
    } else if (detection.score > group.best.score) {
      group.best = detection;
    }
    const key = occurrenceKey(item);
    if (!group.occurrences.has(key)) {
      group.occurrences.set(key, {
        path: item.path,
        ...(item.commitSha === undefined ? {} : { commitSha: item.commitSha }),
        line: detection.line,
        column: detection.column,
        endLine: detection.endLine,
        endColumn: detection.endColumn,
        ruleId: detection.ruleId,
        score: detection.score,
        severity: detection.severity,
      });
    }
  }

  const suppressed = options.suppressedFingerprints ?? new Set<string>();
  const candidates: FindingCandidate[] = [];
  for (const [fingerprint, { best, occurrences }] of groups) {
    candidates.push({
      fingerprint,
      ruleId: best.ruleId,
      category: best.category,
      severity: best.severity,
      score: best.score,
      maskedPreview: best.maskedPreview,
      suppressed: suppressed.has(fingerprint),
      occurrences: [...occurrences.values()],
    });
  }
  return candidates.toSorted(
    (a, b) => severityRank(b.severity) - severityRank(a.severity) || b.score - a.score,
  );
}
