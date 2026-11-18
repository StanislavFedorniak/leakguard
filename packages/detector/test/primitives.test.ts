import { describe, expect, it } from 'vitest';
import { buildLineIndex, locate } from '../src/line-index.js';
import { maskSecret } from '../src/mask.js';
import { SecretValue } from '../src/secret-value.js';
import { FakeSecrets } from './helpers/fake-secrets.js';

describe('line index', () => {
  const content = 'ab\ncde\r\n\nf';
  const starts = buildLineIndex(content);

  it('records the start of every line', () => {
    expect(starts).toEqual([0, 3, 8, 9]);
  });

  it.each([
    [0, 1, 1],
    [1, 1, 2],
    [3, 2, 1],
    [5, 2, 3],
    [8, 3, 1],
    [9, 4, 1],
    [10, 4, 2],
  ])('offset %d → line %d, column %d', (offset, line, column) => {
    expect(locate(starts, offset)).toEqual({ line, column });
  });

  it('handles empty content', () => {
    expect(locate(buildLineIndex(''), 0)).toEqual({ line: 1, column: 1 });
  });
});

describe('maskSecret', () => {
  const fake = new FakeSecrets(7);

  it('keeps a known prefix and the last 4 characters', () => {
    const token = fake.githubToken();
    expect(maskSecret(token, ['ghp_'])).toBe(`ghp_****${token.slice(-4)}`);
  });

  it('hides short values completely', () => {
    expect(maskSecret('hunter2')).toBe('****');
    expect(maskSecret('abcdefghijk')).toBe('****');
  });

  it('shows only 2 characters of medium-length values', () => {
    expect(maskSecret('abcdefghijklmn')).toBe('****mn');
  });

  it('never reveals more than the prefix and the tail', () => {
    const secret = fake.awsSecretAccessKey();
    const masked = maskSecret(secret);
    expect(masked).toBe(`****${secret.slice(-4)}`);
    expect(masked).not.toContain(secret.slice(0, 8));
  });

  it('ignores whitespace in multi-line secrets', () => {
    expect(maskSecret('abcdefgh\nijklmnopqrstuv')).toBe('****stuv');
  });
});

describe('SecretValue', () => {
  const raw = new FakeSecrets(3).password(24);
  const secret = new SecretValue(raw);

  it('reveals the value only on request', () => {
    expect(secret.reveal()).toBe(raw);
    expect(secret.length).toBe(raw.length);
  });

  it('never serializes the raw value', () => {
    expect(String(secret)).toBe('[REDACTED]');
    expect(JSON.stringify({ secret })).toBe('{"secret":"[REDACTED]"}');
  });

  it('is redacted in util.inspect output', () => {
    const inspect = (secret as unknown as Record<symbol, () => string>)[
      Symbol.for('nodejs.util.inspect.custom')
    ];
    expect(inspect?.call(secret)).toBe('SecretValue([REDACTED])');
  });
});
