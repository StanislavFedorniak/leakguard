import { describe, expect, it } from 'vitest';
import {
  checkGitignore,
  classifySensitiveFile,
  findCommittedSensitiveFiles,
} from '../src/config-files.js';
import { IgnoreMatcher } from '../src/ignore.js';
import { createDetector } from '../src/scanner.js';
import { FakeSecrets } from './helpers/fake-secrets.js';

describe('classifySensitiveFile', () => {
  it.each([
    ['.env', 'env-file'],
    ['apps/api/.env.production', 'env-file'],
    ['.env.local', 'env-file'],
    ['deploy/server.pem', 'private-key-file'],
    ['home/.ssh/id_ed25519', 'private-key-file'],
    ['android/release.keystore', 'private-key-file'],
    ['.pgpass', 'credentials-file'],
    ['config/credentials.json', 'credentials-file'],
    ['gcp/service-account-prod.json', 'credentials-file'],
    ['.aws/credentials', 'credentials-file'],
    ['infra/terraform.tfstate', 'terraform-state'],
    ['infra/terraform.tfstate.backup', 'terraform-state'],
  ] as const)('%s → %s', (path, kind) => {
    expect(classifySensitiveFile(path)).toBe(kind);
  });

  it.each([
    '.env.example',
    '.env.sample',
    '.envrc',
    'src/env.ts',
    'id_rsa.pub',
    'credentials.ts',
    'docs/credentials',
    'main.tf',
  ])('%s is not sensitive', (path) => {
    expect(classifySensitiveFile(path)).toBeNull();
  });
});

describe('findCommittedSensitiveFiles', () => {
  const paths = [
    'src/index.ts',
    '.env',
    '.env.example',
    'deploy/key.pem',
    'test/fixtures/key.pem',
    'node_modules/pkg/.env',
    'docs/sample/.env',
  ];

  it('reports sensitive files with their severity', () => {
    const issues = findCommittedSensitiveFiles(paths);
    expect(issues.map((i) => [i.path, i.ruleId, i.severity])).toEqual([
      ['.env', 'committed-env-file', 'high'],
      ['deploy/key.pem', 'committed-private-key-file', 'critical'],
      ['test/fixtures/key.pem', 'committed-private-key-file', 'low'],
      ['docs/sample/.env', 'committed-env-file', 'low'],
    ]);
    expect(issues.every((i) => i.kind === 'sensitive-file-committed')).toBe(true);
  });

  it('respects user ignore paths', () => {
    const issues = findCommittedSensitiveFiles(
      paths,
      IgnoreMatcher.fromPatterns(['test/', 'docs/']),
    );
    expect(issues.map((i) => i.path)).toEqual(['.env', 'deploy/key.pem']);
  });
});

describe('checkGitignore', () => {
  it('requires .env even when there is no such file yet', () => {
    const issues = checkGitignore('node_modules/\n', ['src/index.ts']);
    expect(issues).toEqual([
      {
        kind: 'gitignore-missing-entry',
        ruleId: 'gitignore-missing-env-file',
        fileKind: 'env-file',
        severity: 'medium',
        path: '.gitignore',
        suggestions: ['.env'],
      },
    ]);
  });

  it('treats a missing .gitignore as empty', () => {
    const issues = checkGitignore(null, ['certs/server.key']);
    expect(issues.map((i) => [i.ruleId, i.suggestions])).toEqual([
      ['gitignore-missing-env-file', ['.env']],
      ['gitignore-missing-private-key-file', ['/certs/server.key']],
    ]);
  });

  it('reports nothing when every sensitive file is covered', () => {
    const gitignore = '.env\n.env.*\n!.env.example\n*.pem\n*.tfstate*\n';
    const paths = ['.env.production', '.env.example', 'deploy/key.pem', 'infra/main.tfstate'];
    expect(checkGitignore(gitignore, paths)).toEqual([]);
  });

  it('does not repeat a path the suggested entry already covers', () => {
    const issues = checkGitignore('', ['.env', 'apps/api/.env', 'apps/api/.env.local']);
    expect(issues[0]?.suggestions).toEqual(['.env', '/apps/api/.env.local']);
  });

  it('skips test files and user-ignored paths', () => {
    const issues = checkGitignore(
      '.env\n',
      ['test/fixtures/key.pem', 'vendor-keys/a.pem'],
      IgnoreMatcher.fromPatterns(['vendor-keys/']),
    );
    expect(issues).toEqual([]);
  });

  it('respects negation in the repository .gitignore', () => {
    const issues = checkGitignore('*.pem\n!public.pem\n.env\n', ['certs/public.pem']);
    expect(issues.map((i) => i.suggestions)).toEqual([['/certs/public.pem']]);
  });
});

describe('detector ignore patterns', () => {
  const token = new FakeSecrets(5).githubToken();

  it('skips files matched by user ignore patterns', () => {
    const detector = createDetector({ ignorePatterns: ['docs/**', '*.snap'] });
    expect(detector.isIgnored('docs/guide/setup.md')).toBe(true);
    expect(detector.isIgnored('src/__snapshots__/a.snap')).toBe(true);
    expect(detector.isIgnored('node_modules/a/index.js')).toBe(true);
    expect(detector.isIgnored('src/index.ts')).toBe(false);

    expect(detector.scan({ path: 'docs/guide/setup.md', content: `TOKEN=${token}` }).skipped).toBe(
      'ignored-path',
    );
    expect(detector.scan({ path: 'src/a.ts', content: `TOKEN=${token}` }).detections).toHaveLength(
      1,
    );
  });
});
