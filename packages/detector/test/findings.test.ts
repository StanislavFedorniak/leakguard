import { describe, expect, it } from 'vitest';
import {
  createLocalFingerprinter,
  fingerprintSecret,
  normalizeSecret,
} from '../src/fingerprint.js';
import type { Fingerprinter } from '../src/fingerprint.js';
import { groupDetections } from '../src/findings.js';
import type { LocatedDetection } from '../src/findings.js';
import { scanText } from '../src/scanner.js';
import { SecretValue } from '../src/secret-value.js';
import { ALNUM, FakeSecrets } from './helpers/fake-secrets.js';

const fake = new FakeSecrets(404);
const local = createLocalFingerprinter();

/** Scans `content` at `path` and attaches the location, as the worker will do. */
function located(path: string, content: string, commitSha?: string): LocatedDetection[] {
  return scanText({ path, content }).detections.map((detection) => ({
    path,
    detection,
    ...(commitSha === undefined ? {} : { commitSha }),
  }));
}

describe('normalizeSecret', () => {
  it('trims single-line values', () => {
    expect(normalizeSecret('  abc  ')).toBe('abc');
    expect(normalizeSecret('a b')).toBe('a b');
  });

  it('removes all whitespace from multi-line values', () => {
    expect(normalizeSecret('AAAA\nBBBB\r\n  CCCC')).toBe('AAAABBBBCCCC');
  });
});

describe('fingerprints', () => {
  it('are deterministic and differ for different secrets', () => {
    expect(local('abc')).toBe(local('abc'));
    expect(local('abc')).not.toBe(local('abd'));
    expect(local('abc')).toMatch(/^local:[0-9a-f]{16}$/);
  });

  it('do not contain the secret', () => {
    const secret = fake.password(24);
    expect(local(secret)).not.toContain(secret);
  });

  it('accept a SecretValue or a string and normalize first', () => {
    const block = 'AAAA\nBBBB';
    expect(fingerprintSecret(new SecretValue(block), local)).toBe(
      fingerprintSecret('AAAABBBB', local),
    );
  });
});

describe('groupDetections', () => {
  const token = fake.githubToken();
  const password = fake.random(ALNUM, 20);

  it('merges the same secret across files and commits into one finding', () => {
    const items = [
      ...located('.env', `GITHUB_TOKEN=${token}`, 'c1'),
      ...located('src/deploy.ts', `const auth = "${token}";`, 'c2'),
      ...located('README.md', `token: ${token}`, 'c2'),
    ];
    const candidates = groupDetections(items, { fingerprinter: local });

    expect(candidates).toHaveLength(1);
    const [finding] = candidates;
    expect(finding?.occurrences.map((o) => [o.path, o.commitSha])).toEqual([
      ['.env', 'c1'],
      ['src/deploy.ts', 'c2'],
      ['README.md', 'c2'],
    ]);
    // Representative fields come from the strongest occurrence (.env).
    expect(finding).toMatchObject({
      ruleId: 'github-token',
      severity: 'critical',
      suppressed: false,
    });
    expect(finding?.score).toBe(Math.max(...(finding?.occurrences.map((o) => o.score) ?? [])));
  });

  it('keeps different secrets apart and orders by severity', () => {
    const items = [
      ...located('src/db.ts', `DB_PASSWORD=${password}`),
      ...located('.env', `GITHUB_TOKEN=${token}`),
    ];
    const candidates = groupDetections(items, { fingerprinter: local });
    expect(candidates.map((c) => c.ruleId)).toEqual(['github-token', 'generic-secret-assignment']);
  });

  it('merges a secret matched by different rules', () => {
    // The same value as a generic assignment in one file and a URI password in another.
    const items = [
      ...located('src/a.ts', `DB_PASSWORD=${password}`),
      ...located('src/b.ts', `postgres://app:${password}@db.internal/app`),
    ];
    const candidates = groupDetections(items, { fingerprinter: local });
    expect(candidates).toHaveLength(1);
    expect(new Set(candidates[0]?.occurrences.map((o) => o.ruleId))).toEqual(
      new Set(['generic-secret-assignment', 'postgres-uri']),
    );
  });

  it('collapses the same location reported twice', () => {
    const once = located('.env', `TOKEN=${token}`, 'c1');
    const candidates = groupDetections([...once, ...once], { fingerprinter: local });
    expect(candidates[0]?.occurrences).toHaveLength(1);
  });

  it('marks suppressed fingerprints instead of dropping them', () => {
    const fingerprint = fingerprintSecret(token, local);
    const candidates = groupDetections(located('.env', `TOKEN=${token}`), {
      fingerprinter: local,
      suppressedFingerprints: new Set([fingerprint]),
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ fingerprint, suppressed: true });
  });

  it('passes the normalized secret to an injected fingerprinter', () => {
    const seen: string[] = [];
    const spy: Fingerprinter = (value) => {
      seen.push(value);
      return `fp-${seen.length}`;
    };
    groupDetections(located('key.pem', fake.privateKeyBlock()), { fingerprinter: spy });
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toMatch(/\s/);
  });

  it('produces candidates without raw secrets', () => {
    const candidates = groupDetections(located('.env', `TOKEN=${token}`), { fingerprinter: local });
    expect(JSON.stringify(candidates)).not.toContain(token);
  });

  it('returns nothing for no detections', () => {
    expect(groupDetections([], { fingerprinter: local })).toEqual([]);
  });
});
