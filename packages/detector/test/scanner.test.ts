import { describe, expect, it } from 'vitest';
import { createDetector, resolveOverlaps, scanText } from '../src/scanner.js';
import type { Detection } from '../src/types.js';
import { ALNUM, FakeSecrets } from './helpers/fake-secrets.js';

const fake = new FakeSecrets(99);

describe('scanText', () => {
  it('reports rule, severity, position and mask', () => {
    const token = fake.githubToken();
    const content = `# deploy\nGITHUB_TOKEN=${token}\n`;
    const { detections, skipped } = scanText({ path: '.env', content });

    expect(skipped).toBeNull();
    expect(detections).toHaveLength(1);
    const [detection] = detections;
    expect(detection).toMatchObject({
      ruleId: 'github-token',
      category: 'vcs-token',
      severity: 'critical',
      line: 2,
      column: 'GITHUB_TOKEN='.length + 1,
      endLine: 2,
      endColumn: 'GITHUB_TOKEN='.length + 1 + token.length,
      maskedPreview: `ghp_****${token.slice(-4)}`,
    });
    expect(detection?.secret.reveal()).toBe(token);
    expect(content.slice(detection?.startOffset, detection?.endOffset)).toBe(token);
  });

  it('never exposes the raw secret when serialized', () => {
    const token = fake.githubToken();
    const result = scanText({ path: '.env', content: `TOKEN=${token}` });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).toContain('[REDACTED]');
  });

  it('scores the same secret higher in .env than in a fixture', () => {
    const content = `DB_PASSWORD=${fake.random(ALNUM, 20)}`;
    const [inEnv] = scanText({ path: '.env', content }).detections;
    const [inFixture] = scanText({ path: 'test/fixtures/db.env', content }).detections;
    const [inSource] = scanText({ path: 'src/db.ts', content }).detections;

    expect(inEnv?.severity).toBe('high');
    expect(inSource?.score).toBeLessThan(inEnv?.score ?? 0);
    // In a fixture the generic rule falls below the minimum score.
    expect(inFixture).toBeUndefined();
  });

  it('prefers the specific rule over the generic one on the same value', () => {
    const { detections } = scanText({
      path: 'src/a.ts',
      content: `const apiToken = "${fake.githubToken()}";`,
    });
    expect(detections.map((d) => d.ruleId)).toEqual(['github-token']);
  });

  it('finds several secrets on one line in order', () => {
    const content = `ids: ${fake.awsAccessKeyId()} ${fake.googleApiKey()}`;
    const { detections } = scanText({ path: 'src/a.ts', content });
    expect(detections.map((d) => d.ruleId)).toEqual(['aws-access-key-id', 'google-api-key']);
  });

  it('locates a multi-line private key body', () => {
    const block = fake.privateKeyBlock();
    const content = `const key = \`\n${block}\n\`;`;
    const { detections } = scanText({ path: 'src/key.ts', content });

    expect(detections).toHaveLength(1);
    expect(detections[0]).toMatchObject({
      ruleId: 'private-key',
      severity: 'critical',
      line: 3,
      column: 1,
      endLine: 8,
    });
    expect(detections[0]?.signals.keyword).toBe(1);
  });

  it('handles Windows line endings', () => {
    const token = fake.githubToken();
    const { detections } = scanText({ path: 'a.txt', content: `first\r\nkey=${token}\r\n` });
    expect(detections[0]).toMatchObject({ line: 2, column: 5, endColumn: 5 + token.length });
  });

  it('skips ignored paths, binary and too large inputs', () => {
    const content = `TOKEN=${fake.githubToken()}`;
    expect(scanText({ path: 'node_modules/x/.env', content }).skipped).toBe('ignored-path');
    expect(scanText({ path: 'a.bin', content: `\0${content}` }).skipped).toBe('binary');
    expect(scanText({ path: 'a.txt', content }, { maxContentLength: 10 }).skipped).toBe(
      'too-large',
    );
  });

  it('skips lines longer than the limit and counts them', () => {
    const longLine = `TOKEN=${fake.githubToken()}${' '.repeat(100)}`;
    const shortLine = `KEY=${fake.githubToken()}`;
    const result = scanText(
      { path: 'a.txt', content: `${longLine}\n${shortLine}` },
      { maxLineLength: 80 },
    );
    expect(result.skippedLongLines).toBe(1);
    expect(result.detections.map((d) => d.line)).toEqual([2]);
  });

  it('returns nothing quickly when no rule keyword is present', () => {
    expect(scanText({ path: 'a.txt', content: 'hello world' })).toEqual({
      detections: [],
      skipped: null,
      skippedLongLines: 0,
    });
  });

  it('respects disabled rules', () => {
    const content = `x = ${fake.googleApiKey()}`;
    expect(scanText({ path: 'a.ts', content }).detections).toHaveLength(1);
    expect(
      scanText({ path: 'a.ts', content }, { disabledRuleIds: ['google-api-key'] }).detections,
    ).toHaveLength(0);
  });

  it('applies custom weights, thresholds and minimum score', () => {
    const content = `x = ${fake.googleApiKey()}`;
    const strict = scanText({ path: 'a.ts', content }, { minScore: 0.99 });
    expect(strict.detections).toHaveLength(0);

    const lenient = scanText(
      { path: 'a.ts', content },
      { weights: { ruleConfidence: 1 }, thresholds: { critical: 0.5 } },
    );
    expect(lenient.detections[0]?.severity).toBe('critical');
  });
});

describe('createDetector', () => {
  it('exposes the active rules', () => {
    const detector = createDetector({ disabledRuleIds: ['jwt'] });
    expect(detector.rules.some((rule) => rule.id === 'jwt')).toBe(false);
    expect(detector.rules.length).toBeGreaterThan(10);
  });

  it('can be reused across inputs', () => {
    const detector = createDetector();
    const a = detector.scan({ path: 'a.ts', content: `k=${fake.googleApiKey()}` });
    const b = detector.scan({ path: 'b.ts', content: `k=${fake.googleApiKey()}` });
    expect(a.detections).toHaveLength(1);
    expect(b.detections).toHaveLength(1);
  });
});

/** A minimal detection for overlap tests: only span, score and confidence matter. */
const detection = (start: number, end: number, score: number, confidence = 0.5): Detection =>
  ({
    startOffset: start,
    endOffset: end,
    score,
    signals: { ruleConfidence: confidence },
  }) as Detection;

describe('resolveOverlaps', () => {
  it('keeps the highest score among overlapping spans', () => {
    const kept = resolveOverlaps([detection(0, 10, 0.4), detection(5, 15, 0.9)]);
    expect(kept.map((d) => d.score)).toEqual([0.9]);
  });

  it('keeps disjoint spans and orders them by position', () => {
    const kept = resolveOverlaps([detection(20, 30, 0.4), detection(0, 10, 0.9)]);
    expect(kept.map((d) => d.startOffset)).toEqual([0, 20]);
  });

  it('breaks score ties by rule confidence', () => {
    const kept = resolveOverlaps([detection(0, 10, 0.5, 0.3), detection(0, 10, 0.5, 0.9)]);
    expect(kept[0]?.signals.ruleConfidence).toBe(0.9);
  });

  it('treats touching spans as disjoint', () => {
    expect(resolveOverlaps([detection(0, 10, 0.5), detection(10, 20, 0.5)])).toHaveLength(2);
  });
});
