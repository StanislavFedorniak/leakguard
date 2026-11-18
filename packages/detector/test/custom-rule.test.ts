import { describe, expect, it } from 'vitest';
import { compileCustomRule, MAX_CUSTOM_PATTERN_LENGTH } from '../src/rules/custom.js';
import { scanText } from '../src/scanner.js';

describe('compileCustomRule', () => {
  it('compiles a valid pattern and uses group 1 as the secret', () => {
    const result = compileCustomRule({ id: 'acme', pattern: 'acme_key=([A-Z0-9]{20})' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rule).toMatchObject({
        id: 'acme',
        source: 'custom',
        category: 'custom',
        secretGroup: 1,
        confidence: 0.6,
      });
    }
  });

  it('uses the whole match when there are no groups', () => {
    const result = compileCustomRule({ id: 'acme', pattern: 'ACME-[0-9]{12}' });
    expect(result.ok && result.rule.secretGroup).toBe(0);
  });

  it('honours case-insensitivity, confidence and keywords', () => {
    const result = compileCustomRule({
      id: 'acme',
      pattern: 'acme-[0-9]{12}',
      caseInsensitive: true,
      confidence: 0.9,
      keywords: ['ACME'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rule.pattern.flags).toContain('i');
      expect(result.rule.confidence).toBe(0.9);
      expect(result.rule.keywords).toEqual(['acme']);
    }
  });

  it.each([
    ['', 'empty-pattern'],
    ['   ', 'empty-pattern'],
    ['a'.repeat(MAX_CUSTOM_PATTERN_LENGTH + 1), 'pattern-too-long'],
    ['([a-z]', 'invalid-syntax'],
    ['(a+)+$', 'unsafe-pattern'],
    ['(\\w*)*x', 'unsafe-pattern'],
    ['(a{1,9})+', 'unsafe-pattern'],
    ['(x)\\1', 'unsafe-pattern'],
    ['a*', 'matches-empty-string'],
  ] as const)('rejects %j with %s', (pattern, error) => {
    expect(compileCustomRule({ id: 'x', pattern })).toEqual({ ok: false, error });
  });

  it.each([-0.1, 1.5, Number.NaN])('rejects confidence %d', (confidence) => {
    expect(compileCustomRule({ id: 'x', pattern: 'abc', confidence })).toEqual({
      ok: false,
      error: 'invalid-confidence',
    });
  });

  it('plugs into the scanner', () => {
    const compiled = compileCustomRule({
      id: 'acme-key',
      pattern: 'acme_key=([A-Za-z0-9]{24})',
      confidence: 0.9,
    });
    if (!compiled.ok) {
      throw new Error(compiled.error);
    }
    const content = 'acme_key=Q7wE9rT2yU4iO6pA8sD0fG1h';
    const { detections } = scanText(
      { path: 'src/acme.ts', content },
      { customRules: [compiled.rule] },
    );
    expect(detections.map((d) => d.ruleId)).toEqual(['acme-key']);
    expect(detections[0]?.column).toBe('acme_key='.length + 1);
  });
});
