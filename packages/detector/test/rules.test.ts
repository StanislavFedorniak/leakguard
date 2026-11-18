import { describe, expect, it } from 'vitest';
import { BUILTIN_RULES } from '../src/rules/builtin.js';
import { scanText } from '../src/scanner.js';
import { ALNUM, FakeSecrets } from './helpers/fake-secrets.js';

const fake = new FakeSecrets(2026);
const pw = (): string => fake.random(ALNUM, 20);

/** A neutral source path: neither sensitive nor test. */
const PATH = 'src/settings.ts';

const ruleIdsIn = (content: string): string[] =>
  scanText({ path: PATH, content }).detections.map((d) => d.ruleId);

interface RuleCases {
  readonly positive: readonly string[];
  readonly negative: readonly string[];
}

const CASES: Record<string, RuleCases> = {
  'github-token': {
    positive: [
      `const token = "${fake.githubToken()}";`,
      `GH=${fake.githubToken('ghs')}`,
      `auth: ${fake.githubFineGrainedToken()}`,
    ],
    negative: [
      'const prefix = "ghp_";',
      `ghp_${'x'.repeat(36)}`,
      `xghp_${fake.random(ALNUM, 36)}`,
      `ghp_${fake.random(ALNUM, 40)}`,
    ],
  },
  'aws-access-key-id': {
    positive: [`aws_access_key_id = ${fake.awsAccessKeyId()}`, `"${fake.awsAccessKeyId()}"`],
    negative: [
      // The key published in the AWS documentation.
      'aws_access_key_id = AKIAIOSFODNN7EXAMPLE',
      `akia${fake.random('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 16)}`,
      'AKIA1234',
    ],
  },
  'aws-secret-access-key': {
    positive: [
      `aws_secret_access_key = ${fake.awsSecretAccessKey()}`,
      `AWS_SECRET_KEY: "${fake.awsSecretAccessKey()}"`,
    ],
    negative: [
      `aws_secret_access_key = ${'a'.repeat(40)}`,
      'aws_secret_access_key = ${AWS_SECRET}',
    ],
  },
  'google-api-key': {
    positive: [`const key = "${fake.googleApiKey()}";`],
    negative: ['AIzaShort', `AIza${'x'.repeat(35)}`],
  },
  'stripe-live-key': {
    positive: [`STRIPE_KEY=${fake.stripeKey('live')}`],
    negative: ['sk_live_123', 'sk_live_************************'],
  },
  'stripe-test-key': {
    positive: [`stripe.setKey("${fake.stripeKey('test')}")`],
    negative: ['sk_test_abc'],
  },
  'slack-token': {
    positive: [`SLACK_BOT=${fake.slackToken()}`],
    negative: ['xoxb-123', 'xoxz-1234567890-abcdefghij'],
  },
  'slack-webhook-url': {
    positive: [`webhook: ${fake.slackWebhookUrl()}`],
    negative: ['https://hooks.slack.com/services/XXX/YYY/ZZZ'],
  },
  jwt: {
    positive: [`Authorization: Bearer ${fake.jwt()}`],
    negative: ['eyJhbGciOiJIUzI1NiJ9', 'eyJabc.eyJdef.ghi'],
  },
  'private-key': {
    positive: [fake.privateKeyBlock(), fake.privateKeyBlock('OPENSSH'), fake.privateKeyBlock('EC')],
    negative: [
      '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA\n-----END PUBLIC KEY-----',
      '-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----',
    ],
  },
  'postgres-uri': {
    positive: [
      `DATABASE_URL=postgres://app:${pw()}@db.internal:5432/app`,
      `url: "postgresql://admin:${pw()}@10.0.0.5/prod"`,
    ],
    negative: [
      'DATABASE_URL=postgres://localhost:5432/app',
      'postgres://user:${DB_PASSWORD}@db/app',
      'postgres://postgres:postgres@localhost/app',
    ],
  },
  'mysql-uri': {
    positive: [`mysql://app:${pw()}@db.internal:3306/shop`],
    negative: ['mysql://root:root@localhost/db', 'mysql://localhost/db'],
  },
  'mongodb-uri': {
    positive: [
      `MONGO=mongodb+srv://app:${pw()}@cluster0.mongodb.net/db`,
      `mongodb://app:${pw()}@mongo:27017`,
    ],
    negative: ['mongodb://localhost:27017', 'mongodb://user:<password>@cluster0.mongodb.net'],
  },
  'sqlserver-connection-string': {
    positive: [`"Default": "Server=db;Database=app;User Id=sa;Password=${pw()};"`],
    negative: [
      '"Default": "Server=db;Database=app;Integrated Security=true;"',
      'Server=db;Password=changeme;',
    ],
  },
  'generic-secret-assignment': {
    positive: [
      `DB_PASSWORD=${pw()}`,
      `"clientSecret": "${pw()}"`,
      `api_key: ${pw()}`,
      `private_key := "${pw()}"`,
    ],
    negative: [
      'password = "changeme"',
      'const token = getToken();',
      'token: this.config.token',
      `password = "${'a'.repeat(12)}"`,
      'PASSWORD=${DB_PASSWORD}',
      'tokenType: "Bearer"',
    ],
  },
};

describe('built-in rules', () => {
  it('have unique ids and valid confidence', () => {
    const ids = BUILTIN_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of BUILTIN_RULES) {
      expect(rule.confidence).toBeGreaterThan(0);
      expect(rule.confidence).toBeLessThanOrEqual(1);
      for (const keyword of rule.keywords ?? []) {
        expect(keyword).toBe(keyword.toLowerCase());
      }
    }
  });

  it('every rule has test cases', () => {
    expect(Object.keys(CASES).toSorted()).toEqual(BUILTIN_RULES.map((rule) => rule.id).toSorted());
  });

  for (const [ruleId, { positive, negative }] of Object.entries(CASES)) {
    describe(ruleId, () => {
      it.each(positive.map((content, i) => [i, content]))('detects positive #%d', (_, content) => {
        expect(ruleIdsIn(content)).toContain(ruleId);
      });

      it.each(negative.map((content, i) => [i, content]))('ignores negative #%d', (_, content) => {
        expect(ruleIdsIn(content)).not.toContain(ruleId);
      });
    });
  }
});

describe('typical non-secrets', () => {
  it.each([
    ['UUID', `request_id = "${fake.uuid()}"`],
    ['SHA-1', `commit = "${fake.hex(40)}"`],
    ['SHA-256', `"integrity": "sha256-${fake.hex(64)}"`],
    ['URL without credentials', 'API_URL=https://api.example.com/v1'],
    ['type annotation', 'password: string;'],
    ['env reference', 'const secret = process.env.JWT_SECRET;'],
  ])('%s produces no detections', (_, content) => {
    expect(ruleIdsIn(content)).toEqual([]);
  });
});
