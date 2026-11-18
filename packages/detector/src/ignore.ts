/**
 * A dependency-free matcher for `.gitignore` syntax.
 *
 * It is used for two things: user-defined ignore paths (`IgnorePath`) and the
 * analysis of a repository's own `.gitignore`. Supported syntax:
 * blank lines and `#` comments, `!` negation, trailing `/` (directories only),
 * leading or inner `/` (anchored to the root), `*`, `?`, `[...]`, `**`
 * (`**\/x`, `x/**`, `a/**\/b`), backslash escapes and escaped trailing spaces.
 *
 * Semantics follow git: the last matching rule wins, and a file inside an
 * ignored directory cannot be re-included by a negated rule, because git does
 * not descend into ignored directories.
 */

export interface IgnoreRule {
  /** The original line. */
  readonly source: string;
  readonly negated: boolean;
  readonly directoryOnly: boolean;
  readonly regex: RegExp;
}

export interface IgnoreOptions {
  /** Git is case-sensitive by default (`core.ignoreCase = false`). */
  readonly caseInsensitive?: boolean;
}

export type IgnorePatternError = 'empty' | 'too-long';

export const MAX_IGNORE_PATTERN_LENGTH = 256;

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\/]/g;

function escapeRegex(text: string): string {
  return text.replace(REGEX_SPECIAL, '\\$&');
}

/** Index of the `]` that closes a bracket expression starting at `start`, or -1. */
function findClassEnd(glob: string, start: number): number {
  let i = start + 1;
  if (glob[i] === '!' || glob[i] === '^') {
    i++;
  }
  if (glob[i] === ']') {
    i++; // A leading "]" is a literal member of the class.
  }
  return glob.indexOf(']', i);
}

function translateClass(body: string): string {
  const negated = body.startsWith('!') || body.startsWith('^');
  const members = (negated ? body.slice(1) : body).replace(/[\\\]^]/g, '\\$&');
  // A class never matches the path separator, like any other single-character glob.
  return negated ? `[^/${members}]` : `(?!/)[${members}]`;
}

/** Translates the body of a glob (without anchoring) into a regular expression source. */
export function globToRegexSource(glob: string): string {
  let out = '';
  let i = 0;
  while (i < glob.length) {
    const char = glob[i] ?? '';
    const atSegmentStart = i === 0 || glob[i - 1] === '/';

    if (atSegmentStart && glob.startsWith('**/', i)) {
      out += '(?:.*/)?'; // zero or more directories
      i += 3;
    } else if (atSegmentStart && i === glob.length - 2 && glob.endsWith('**')) {
      out += '.*'; // everything inside
      i += 2;
    } else if (char === '*') {
      out += '[^/]*';
      while (glob[i] === '*') {
        i++; // Other consecutive asterisks behave like a single one.
      }
    } else if (char === '?') {
      out += '[^/]';
      i++;
    } else if (char === '[' && findClassEnd(glob, i) !== -1) {
      const end = findClassEnd(glob, i);
      out += translateClass(glob.slice(i + 1, end));
      i = end + 1;
    } else if (char === '\\' && i + 1 < glob.length) {
      out += escapeRegex(glob[i + 1] ?? '');
      i += 2;
    } else {
      out += escapeRegex(char);
      i++;
    }
  }
  return out;
}

/** Converts a path to the form git compares against: forward slashes, no leading `./` or `/`. */
export function toRepoPath(path: string): string {
  return path
    .replaceAll('\\', '/')
    .replace(/^(\.\/|\/)+/, '')
    .replace(/\/+$/, '');
}

/** Parses one `.gitignore` line. Returns `null` for blank lines and comments. */
export function parseIgnoreLine(line: string, options: IgnoreOptions = {}): IgnoreRule | null {
  let text = line.endsWith('\r') ? line.slice(0, -1) : line;
  // Trailing spaces are dropped unless the last one is escaped with a backslash.
  while (text.endsWith(' ') && !text.endsWith('\\ ')) {
    text = text.slice(0, -1);
  }
  if (text === '' || text.startsWith('#')) {
    return null;
  }

  let negated = false;
  if (text.startsWith('!')) {
    negated = true;
    text = text.slice(1);
  } else if (text.startsWith('\\!') || text.startsWith('\\#')) {
    text = text.slice(1);
  }

  let directoryOnly = false;
  if (text.endsWith('/')) {
    directoryOnly = true;
    text = text.slice(0, -1);
  }
  if (text === '') {
    return null;
  }

  // A slash at the beginning or in the middle anchors the pattern to the root;
  // otherwise it matches at any depth.
  const anchored = text.includes('/');
  if (text.startsWith('/')) {
    text = text.slice(1);
  }
  const prefix = anchored ? '^' : '^(?:.*/)?';
  const regex = new RegExp(
    `${prefix}${globToRegexSource(text)}$`,
    options.caseInsensitive ? 'i' : '',
  );
  return { source: line, negated, directoryOnly, regex };
}

/** Validates a user-supplied ignore pattern before it is stored. */
export function validateIgnorePattern(pattern: string): IgnorePatternError | null {
  if (pattern.length > MAX_IGNORE_PATTERN_LENGTH) {
    return 'too-long';
  }
  return parseIgnoreLine(pattern) === null ? 'empty' : null;
}

export class IgnoreMatcher {
  readonly #rules: readonly IgnoreRule[];

  constructor(rules: readonly IgnoreRule[]) {
    this.#rules = rules;
  }

  /** Builds a matcher from separate patterns; overlong ones are skipped. */
  static fromPatterns(patterns: Iterable<string>, options: IgnoreOptions = {}): IgnoreMatcher {
    const rules: IgnoreRule[] = [];
    for (const pattern of patterns) {
      const rule =
        pattern.length <= MAX_IGNORE_PATTERN_LENGTH ? parseIgnoreLine(pattern, options) : null;
      if (rule) {
        rules.push(rule);
      }
    }
    return new IgnoreMatcher(rules);
  }

  /** Builds a matcher from the content of a `.gitignore` file. */
  static fromGitignore(content: string, options: IgnoreOptions = {}): IgnoreMatcher {
    return IgnoreMatcher.fromPatterns(content.split('\n'), options);
  }

  get size(): number {
    return this.#rules.length;
  }

  /** The decision of the last matching rule, or `undefined` when no rule matches. */
  #decide(path: string, isDirectory: boolean): boolean | undefined {
    for (let i = this.#rules.length - 1; i >= 0; i--) {
      const rule = this.#rules[i];
      if (rule && (isDirectory || !rule.directoryOnly) && rule.regex.test(path)) {
        return !rule.negated;
      }
    }
    return undefined;
  }

  isIgnored(path: string, isDirectory = false): boolean {
    if (this.#rules.length === 0) {
      return false;
    }
    const normalized = toRepoPath(path);
    const segments = normalized.split('/');
    // Check ancestors from the root: once a directory is ignored, nothing inside
    // it can be re-included.
    for (let depth = 1; depth < segments.length; depth++) {
      if (this.#decide(segments.slice(0, depth).join('/'), true) === true) {
        return true;
      }
    }
    return this.#decide(normalized, isDirectory) === true;
  }
}
