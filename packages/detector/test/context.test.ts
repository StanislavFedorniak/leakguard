import { describe, expect, it } from 'vitest';
import {
  isIgnoredByDefault,
  keywordSignal,
  normalizePath,
  pathSignals,
  placeholderSignal,
} from '../src/context.js';

describe('normalizePath', () => {
  it('uses forward slashes, lower case and no leading ./', () => {
    expect(normalizePath('.\\Config\\AppSettings.JSON')).toBe('config/appsettings.json');
    expect(normalizePath('/src/a.ts')).toBe('src/a.ts');
  });
});

describe('isIgnoredByDefault', () => {
  it.each([
    'node_modules/pkg/index.js',
    'packages/a/node_modules/x.js',
    'vendor/lib.php',
    'dist/main.js',
    'build/out.js',
    'package-lock.json',
    'sub/yarn.lock',
    'go.sum',
  ])('ignores %s', (path) => {
    expect(isIgnoredByDefault(path)).toBe(true);
  });

  it.each(['src/index.ts', '.env', 'distribution/readme.txt', 'builder.ts'])('scans %s', (path) => {
    expect(isIgnoredByDefault(path)).toBe(false);
  });
});

describe('pathSignals', () => {
  it.each([
    '.env',
    '.env.production',
    'server/appsettings.json',
    'appsettings.Development.json',
    'docker-compose.yml',
    'docker-compose.prod.yaml',
    'config/database.ts',
    'secrets.yaml',
    'deploy/id_rsa.pem',
    'application.properties',
    '.npmrc',
  ])('%s is sensitive', (path) => {
    expect(pathSignals(path)).toEqual({ sensitivePath: 1, testPath: 0 });
  });

  it.each([
    'test/app.ts',
    'src/__tests__/a.ts',
    'fixtures/keys.json',
    '.env.example',
    'config.sample',
    'src/auth.test.ts',
    'src/auth.spec.ts',
    'pkg/auth_test.go',
    'README.md',
    'docs/setup.txt',
  ])('%s is a test/example file', (path) => {
    expect(pathSignals(path).testPath).toBe(1);
  });

  it('test location wins over a sensitive name', () => {
    expect(pathSignals('test/fixtures/.env')).toEqual({ sensitivePath: 0, testPath: 1 });
  });

  it('ordinary source files are neutral', () => {
    expect(pathSignals('src/app.ts')).toEqual({ sensitivePath: 0, testPath: 0 });
  });
});

describe('keywordSignal', () => {
  it.each([
    'DB_PASSWORD=',
    '"apiKey": "',
    'const githubToken = ',
    'client_secret: ',
    '-----BEGIN RSA PRIVATE KEY-----\n',
  ])('finds a keyword in %j', (text) => {
    expect(keywordSignal(text)).toBe(1);
  });

  it.each(['const url = ', 'DATABASE_URL=', ''])('finds no keyword in %j', (text) => {
    expect(keywordSignal(text)).toBe(0);
  });

  it('looks only at the last 80 characters', () => {
    expect(keywordSignal(`password${' '.repeat(100)}`)).toBe(0);
  });
});

describe('placeholderSignal', () => {
  it.each([
    'changeme',
    'Password',
    'your-api-key-here',
    'YOUR_TOKEN',
    '<your-key>',
    '${DB_PASSWORD}',
    '{{ secret }}',
    '%API_KEY%',
    'xxxxxxxxxxxx',
    'sk_live_************',
    'AKIAIOSFODNN7EXAMPLE',
    'process.env.TOKEN',
    'os.environ["TOKEN"]',
    'getToken()',
    'this.config.password',
    'placeholder-value',
    'dummy-token-123',
    '00000000000000',
  ])('%j is a placeholder', (value) => {
    expect(placeholderSignal(value)).toBe(1);
  });

  it.each(['PasswordHash', '12345678'])('%j is a weak placeholder', (value) => {
    expect(placeholderSignal(value)).toBe(0.5);
  });

  it.each(['Tr0ub4dor&3xK9', 'a8f5f167f44f4964e6c998dee827110c', 'P@ss(w0rd)2024'])(
    '%j is not a placeholder',
    (value) => {
      expect(placeholderSignal(value)).toBe(0);
    },
  );

  it('does not treat a dotted token as a property access', () => {
    const jwtLike = `eyJ${'a1B2c3D4e5'.repeat(4)}.eyJ${'f6G7h8I9j0'.repeat(4)}.sig${'K1l2'.repeat(10)}`;
    expect(placeholderSignal(jwtLike)).toBe(0);
  });
});
