/**
 * Context heuristics: signals that do not depend on the secret's format but on
 * where it appears (file path, variable name) and what it looks like (placeholder).
 */

export interface PathSignals {
  /** 1 when the file usually holds configuration or secrets, otherwise 0. */
  readonly sensitivePath: number;
  /** 1 when the file is a test, fixture, example or documentation, otherwise 0. */
  readonly testPath: number;
}

const DEFAULT_IGNORED_DIRS = new Set(['node_modules', 'vendor', 'dist', 'build', '.git']);

const LOCK_FILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'composer.lock',
  'gemfile.lock',
  'cargo.lock',
  'poetry.lock',
  'pipfile.lock',
  'go.sum',
  'packages.lock.json',
]);

const SENSITIVE_BASENAMES: readonly RegExp[] = [
  /^\.env(\..+)?$/,
  /^appsettings(\..+)?\.json$/,
  /^web\.config$/,
  /^docker-compose(\..+)?\.ya?ml$/,
  /^compose\.ya?ml$/,
  /^secrets?(\..+)?\.(ya?ml|json)$/,
  /^credentials(\..+)?$/,
  /^\.(npmrc|pypirc|netrc|pgpass)$/,
  /\.(pem|key|p12|pfx|tfvars)$/,
  /^(application|settings|config)(\..+)?\.(ya?ml|json|properties|toml|ini)$/,
];

const SENSITIVE_DIRS = new Set(['config', 'configs', 'conf', 'secrets', '.aws', '.ssh']);

const TEST_DIRS = new Set([
  'test',
  'tests',
  '__tests__',
  'spec',
  'specs',
  'fixtures',
  '__fixtures__',
  'testdata',
  'mocks',
  '__mocks__',
  'examples',
  'example',
  'samples',
  'docs',
]);

const TEST_BASENAMES: readonly RegExp[] = [
  /\.(example|sample|template|dist|tmpl)$/,
  /^\.env\.(example|sample|template|dist)$/,
  /\.(test|spec)\.[a-z]+$/,
  /_test\.(go|py)$/,
  /^test_.+\.py$/,
  /\.md$/,
];

/** Keyword that marks a variable name or a label as holding a secret. */
const SECRET_KEYWORD =
  /(secret|token|passw(?:or)?d|pwd|api[_-]?key|apikey|access[_-]?key|private[ _-]?key|credential|auth[_-]?key)/i;

/** How many characters to the left of a secret are inspected for a keyword. */
const KEYWORD_WINDOW = 80;

/** Values that are obviously not real secrets when they make up the whole value. */
const PLACEHOLDER_VALUES = new Set([
  'password',
  'passwd',
  'secret',
  'changeme',
  'changeit',
  'pass',
  'admin',
  'root',
  'postgres',
  'test',
  'example',
  'dummy',
  'undefined',
  'null',
  'none',
  'true',
  'false',
  'token',
]);

/** Substrings and shapes typical for placeholders in examples and templates. */
const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /example/i,
  /change[_-]?me/i,
  /placeholder/i,
  /dummy/i,
  /your[_-]/i,
  // Bounded repetitions keep these linear even on long values such as PEM bodies.
  /<[^<>]{1,64}>/, // <your-key>
  /\$\{[^{}]{1,64}\}/, // ${VAR}
  /\{\{[^{}]{1,64}\}\}/, // {{ var }}
  /%[A-Z_]{1,64}%/, // %VAR%
  /x{4,}/i,
  /\*{3,}/,
  /\.{3,}/,
  /0{8,}/,
  /(process\.env|os\.environ|getenv|env\[|ENV\[)/,
];

/** `getToken()`, `readSecret(`: a function call, not a literal. */
const FUNCTION_CALL = /^[A-Za-z_$][\w$.]*\(/;
const IDENTIFIER = /^[A-Za-z_$][\w$]{0,31}$/;

/**
 * `config.secret`, `this.password`, `response.data.token`: a property access.
 * Segments are short identifiers, which tells it apart from dotted tokens like JWTs.
 */
function isPropertyAccess(value: string): boolean {
  const segments = value.split('.');
  return segments.length > 1 && segments.every((segment) => IDENTIFIER.test(segment));
}

/** Normalizes a path: forward slashes, lower case, no leading `./` or `/`. */
export function normalizePath(path: string): string {
  return path
    .replaceAll('\\', '/')
    .toLowerCase()
    .replace(/^(\.\/|\/)+/, '');
}

function splitPath(path: string): { dirs: string[]; basename: string } {
  const segments = normalizePath(path).split('/');
  const basename = segments.pop() ?? '';
  return { dirs: segments, basename };
}

/** Vendored code, build output and lock files are skipped by default. */
export function isIgnoredByDefault(path: string): boolean {
  const { dirs, basename } = splitPath(path);
  return dirs.some((dir) => DEFAULT_IGNORED_DIRS.has(dir)) || LOCK_FILES.has(basename);
}

export function pathSignals(path: string): PathSignals {
  const { dirs, basename } = splitPath(path);
  const isTest =
    dirs.some((dir) => TEST_DIRS.has(dir)) || TEST_BASENAMES.some((re) => re.test(basename));
  const isSensitive =
    !isTest &&
    (dirs.some((dir) => SENSITIVE_DIRS.has(dir)) ||
      SENSITIVE_BASENAMES.some((re) => re.test(basename)));
  return { sensitivePath: isSensitive ? 1 : 0, testPath: isTest ? 1 : 0 };
}

/**
 * 1 when a secret-like keyword appears in the text right before the value
 * (`DB_PASSWORD=`, `"apiKey": `, `-----BEGIN PRIVATE KEY-----`), otherwise 0.
 */
export function keywordSignal(textBefore: string): number {
  return SECRET_KEYWORD.test(textBefore.slice(-KEYWORD_WINDOW)) ? 1 : 0;
}

/**
 * Likelihood in [0, 1] that the value is a placeholder rather than a real secret:
 * 1 for known placeholders and code references, 0.5 for weak hints
 * (only letters or only digits), 0 otherwise.
 */
export function placeholderSignal(value: string): number {
  const trimmed = value.trim();
  if (PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) {
    return 1;
  }
  if (
    PLACEHOLDER_PATTERNS.some((re) => re.test(trimmed)) ||
    FUNCTION_CALL.test(trimmed) ||
    isPropertyAccess(trimmed)
  ) {
    return 1;
  }
  if (/^[A-Za-z]+$/.test(trimmed) || /^\d+$/.test(trimmed)) {
    return 0.5;
  }
  return 0;
}
