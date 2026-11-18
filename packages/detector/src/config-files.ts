import type { Severity } from '@leakguard/shared';
import { isIgnoredByDefault, pathSignals } from './context.js';
import { IgnoreMatcher, toRepoPath } from './ignore.js';

/**
 * Checks on the file level, independent of file content:
 * 1. a sensitive file (`.env`, a private key, a credentials file) is committed;
 * 2. the root `.gitignore` does not protect such files.
 *
 * Only the root `.gitignore` is considered; nested ones are out of scope.
 */

export type SensitiveFileKind =
  'env-file' | 'private-key-file' | 'credentials-file' | 'terraform-state';

export type ConfigIssueKind = 'sensitive-file-committed' | 'gitignore-missing-entry';

export interface ConfigFileIssue {
  readonly kind: ConfigIssueKind;
  /** `committed-<file kind>` or `gitignore-missing-<file kind>`; doubles as an i18n key. */
  readonly ruleId: string;
  readonly fileKind: SensitiveFileKind;
  readonly severity: Severity;
  /** The committed file, or `.gitignore` for a missing entry. */
  readonly path: string;
  /** Lines to add to `.gitignore`. Empty for committed files. */
  readonly suggestions: readonly string[];
}

interface FileKindSpec {
  readonly kind: SensitiveFileKind;
  readonly severity: Severity;
  matches(basename: string, dirs: readonly string[]): boolean;
  /**
   * Entry that every repository should have in `.gitignore`, even before such a file
   * appears (only `.env`, which almost every project template produces).
   */
  readonly expectedEntry?: string;
}

const ENV_TEMPLATE = /^\.env\.(example|sample|template|dist|defaults)$/;

const FILE_KINDS: readonly FileKindSpec[] = [
  {
    kind: 'env-file',
    severity: 'high',
    matches: (basename) => /^\.env(\..+)?$/.test(basename) && !ENV_TEMPLATE.test(basename),
    expectedEntry: '.env',
  },
  {
    kind: 'private-key-file',
    severity: 'critical',
    matches: (basename) =>
      /^id_(rsa|dsa|ecdsa|ed25519)$/.test(basename) ||
      /\.(pem|key|p12|pfx|jks|keystore)$/.test(basename),
  },
  {
    kind: 'credentials-file',
    severity: 'high',
    matches: (basename, dirs) =>
      /^\.(pgpass|netrc|git-credentials)$/.test(basename) ||
      /^(credentials|client_secrets?|service[-_]account.*)\.json$/.test(basename) ||
      (basename === 'credentials' && dirs.at(-1) === '.aws'),
  },
  {
    kind: 'terraform-state',
    severity: 'high',
    // State files store resource attributes, including passwords, in plain text.
    matches: (basename) => /\.tfstate(\.backup)?$/.test(basename),
  },
];

function splitRepoPath(path: string): { basename: string; dirs: string[] } {
  const segments = toRepoPath(path).toLowerCase().split('/');
  const basename = segments.pop() ?? '';
  return { basename, dirs: segments };
}

function specFor(path: string): FileKindSpec | undefined {
  const { basename, dirs } = splitRepoPath(path);
  return FILE_KINDS.find((spec) => spec.matches(basename, dirs));
}

/** Returns the kind of sensitive file at `path`, or `null` for ordinary files. */
export function classifySensitiveFile(path: string): SensitiveFileKind | null {
  return specFor(path)?.kind ?? null;
}

interface SensitivePath {
  readonly path: string;
  readonly spec: FileKindSpec;
  readonly isTest: boolean;
}

function collectSensitivePaths(paths: Iterable<string>, ignore?: IgnoreMatcher): SensitivePath[] {
  const result: SensitivePath[] = [];
  for (const path of paths) {
    if (isIgnoredByDefault(path) || ignore?.isIgnored(path)) {
      continue;
    }
    const spec = specFor(path);
    if (spec) {
      result.push({ path, spec, isTest: pathSignals(path).testPath === 1 });
    }
  }
  return result;
}

/**
 * Reports committed sensitive files. Files under test/fixture/example paths usually
 * hold fake data, so they are reported with `low` severity instead of being skipped.
 * `ignore` holds the user's ignore paths, not the repository's `.gitignore`: a file
 * that is already committed is exposed whatever `.gitignore` says.
 */
export function findCommittedSensitiveFiles(
  paths: Iterable<string>,
  ignore?: IgnoreMatcher,
): ConfigFileIssue[] {
  return collectSensitivePaths(paths, ignore).map(({ path, spec, isTest }) => ({
    kind: 'sensitive-file-committed',
    ruleId: `committed-${spec.kind}`,
    fileKind: spec.kind,
    severity: isTest ? 'low' : spec.severity,
    path,
    suggestions: [],
  }));
}

/**
 * Reports kinds of sensitive files that the root `.gitignore` does not cover.
 * A kind is checked when the repository contains such files (outside tests) or when the
 * kind has an entry every repository is expected to have (`.env`).
 * Issues are grouped per kind; suggestions list the lines to add.
 *
 * @param gitignore content of the root `.gitignore`, or `null` when the file is missing
 * @param paths repository file paths
 */
export function checkGitignore(
  gitignore: string | null,
  paths: Iterable<string>,
  ignore?: IgnoreMatcher,
): ConfigFileIssue[] {
  const matcher = IgnoreMatcher.fromGitignore(gitignore ?? '');
  const uncovered = new Map<SensitiveFileKind, Set<string>>();
  const addUncovered = (kind: SensitiveFileKind, entry: string): void => {
    const entries = uncovered.get(kind) ?? new Set<string>();
    entries.add(entry);
    uncovered.set(kind, entries);
  };

  // Entries already suggested, so that a path they would cover is not suggested again.
  const suggested = new Map<SensitiveFileKind, IgnoreMatcher>();
  for (const spec of FILE_KINDS) {
    if (spec.expectedEntry && !matcher.isIgnored(spec.expectedEntry)) {
      addUncovered(spec.kind, spec.expectedEntry);
      suggested.set(spec.kind, IgnoreMatcher.fromPatterns([spec.expectedEntry]));
    }
  }
  for (const { path, spec, isTest } of collectSensitivePaths(paths, ignore)) {
    const coveredBySuggestion = suggested.get(spec.kind)?.isIgnored(path) ?? false;
    if (!isTest && !matcher.isIgnored(path) && !coveredBySuggestion) {
      addUncovered(spec.kind, `/${toRepoPath(path)}`);
    }
  }

  return FILE_KINDS.filter((spec) => uncovered.has(spec.kind)).map((spec) => ({
    kind: 'gitignore-missing-entry',
    ruleId: `gitignore-missing-${spec.kind}`,
    fileKind: spec.kind,
    severity: 'medium',
    path: '.gitignore',
    suggestions: [...(uncovered.get(spec.kind) ?? [])],
  }));
}
