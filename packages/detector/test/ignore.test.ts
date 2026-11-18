import { describe, expect, it } from 'vitest';
import {
  globToRegexSource,
  IgnoreMatcher,
  MAX_IGNORE_PATTERN_LENGTH,
  parseIgnoreLine,
  toRepoPath,
  validateIgnorePattern,
} from '../src/ignore.js';

const ignored = (patterns: string[], path: string, isDirectory = false): boolean =>
  IgnoreMatcher.fromPatterns(patterns).isIgnored(path, isDirectory);

describe('parseIgnoreLine', () => {
  it.each(['', '   ', '# comment', '/', '!'])('skips %j', (line) => {
    expect(parseIgnoreLine(line)).toBeNull();
  });

  it('parses flags', () => {
    expect(parseIgnoreLine('!build/')).toMatchObject({ negated: true, directoryOnly: true });
    expect(parseIgnoreLine('*.log\r')).toMatchObject({ negated: false, directoryOnly: false });
  });

  it('keeps escaped special characters at the start', () => {
    expect(parseIgnoreLine('\\#notes')?.regex.test('#notes')).toBe(true);
    expect(parseIgnoreLine('\\!important')?.regex.test('!important')).toBe(true);
  });

  it('drops trailing spaces unless escaped', () => {
    expect(parseIgnoreLine('a.txt   ')?.regex.test('a.txt')).toBe(true);
    expect(parseIgnoreLine('a\\ ')?.regex.test('a ')).toBe(true);
  });
});

describe('globToRegexSource', () => {
  it('escapes regex metacharacters', () => {
    expect(new RegExp(`^${globToRegexSource('a.b+(c)')}$`).test('a.b+(c)')).toBe(true);
    expect(new RegExp(`^${globToRegexSource('a.b')}$`).test('axb')).toBe(false);
  });

  it('treats an unclosed bracket literally', () => {
    expect(new RegExp(`^${globToRegexSource('a[b')}$`).test('a[b')).toBe(true);
  });
});

describe('IgnoreMatcher (gitignore semantics)', () => {
  it.each([
    // [patterns, path, expected]
    [['*.log'], 'debug.log', true],
    [['*.log'], 'logs/deep/debug.log', true],
    [['*.log'], 'debug.log.txt', false],
    [['.env'], '.env', true],
    [['.env'], 'apps/api/.env', true],
    [['.env'], '.env.example', false],
    [['/.env'], 'apps/api/.env', false],
    [['/.env'], '.env', true],
    [['config/secrets.yml'], 'config/secrets.yml', true],
    [['config/secrets.yml'], 'app/config/secrets.yml', false],
    [['**/secrets.yml'], 'app/config/secrets.yml', true],
    [['**/secrets.yml'], 'secrets.yml', true],
    [['logs/**'], 'logs/a/b.txt', true],
    [['a/**/b'], 'a/b', true],
    [['a/**/b'], 'a/x/y/b', true],
    [['a/**/b'], 'ab', false],
    [['debug?.log'], 'debug1.log', true],
    [['debug?.log'], 'debug10.log', false],
    [['key[0-9].pem'], 'key5.pem', true],
    [['key[!0-9].pem'], 'key5.pem', false],
    [['key[!0-9].pem'], 'keyA.pem', true],
    [['[]x].txt'], '].txt', true],
    [['[]x].txt'], 'y.txt', false],
    [['a*b'], 'a/b', false],
    [['a**b'], 'axxb', true],
    [['node_modules'], 'packages/x/node_modules/y/index.js', true],
  ] as const)('%j vs %s → %s', (patterns, path, expected) => {
    expect(ignored([...patterns], path)).toBe(expected);
  });

  it('applies directory-only patterns to directories and their contents', () => {
    expect(ignored(['build/'], 'build', true)).toBe(true);
    expect(ignored(['build/'], 'build/out.js')).toBe(true);
    expect(ignored(['build/'], 'build')).toBe(false); // a file named "build"
  });

  it('lets the last matching rule win', () => {
    expect(ignored(['*.env', '!prod.env'], 'prod.env')).toBe(false);
    expect(ignored(['!prod.env', '*.env'], 'prod.env')).toBe(true);
  });

  it('cannot re-include a file inside an ignored directory', () => {
    expect(ignored(['secrets/', '!secrets/public.txt'], 'secrets/public.txt')).toBe(true);
    // Here the directory itself is not ignored, only its entries, so negation works.
    expect(ignored(['secrets/*', '!secrets/public.txt'], 'secrets/public.txt')).toBe(false);
  });

  it('is case-sensitive by default and optionally case-insensitive', () => {
    expect(ignored(['*.PEM'], 'key.pem')).toBe(false);
    expect(
      IgnoreMatcher.fromPatterns(['*.PEM'], { caseInsensitive: true }).isIgnored('key.pem'),
    ).toBe(true);
  });

  it('parses a whole .gitignore file', () => {
    const matcher = IgnoreMatcher.fromGitignore('# deps\nnode_modules/\r\n\n.env\n*.pem\n');
    expect(matcher.size).toBe(3);
    expect(matcher.isIgnored('.env')).toBe(true);
    expect(matcher.isIgnored('src/index.ts')).toBe(false);
  });

  it('ignores nothing without rules and skips overlong patterns', () => {
    expect(new IgnoreMatcher([]).isIgnored('anything')).toBe(false);
    expect(IgnoreMatcher.fromPatterns(['a'.repeat(MAX_IGNORE_PATTERN_LENGTH + 1)]).size).toBe(0);
  });

  it('normalizes Windows and relative paths', () => {
    expect(toRepoPath('.\\config\\.env')).toBe('config/.env');
    expect(toRepoPath('/dist/')).toBe('dist');
    expect(ignored(['/config/.env'], '.\\config\\.env')).toBe(true);
  });
});

describe('validateIgnorePattern', () => {
  it('accepts valid patterns', () => {
    expect(validateIgnorePattern('docs/**')).toBeNull();
  });

  it.each([
    ['', 'empty'],
    ['# just a comment', 'empty'],
    ['x'.repeat(MAX_IGNORE_PATTERN_LENGTH + 1), 'too-long'],
  ] as const)('rejects %j as %s', (pattern, error) => {
    expect(validateIgnorePattern(pattern)).toBe(error);
  });
});
