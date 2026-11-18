import type { RuleDefinition } from '../types.js';

/**
 * Built-in detection rules.
 *
 * Every pattern uses bounded or linear repetitions only, so a crafted line cannot
 * trigger catastrophic backtracking. `keywords` are lower-case pre-filters.
 */
export const BUILTIN_RULES: readonly RuleDefinition[] = [
  {
    id: 'github-token',
    category: 'vcs-token',
    source: 'builtin',
    // Classic tokens: ghp_/gho_/ghu_/ghs_/ghr_ + 36 chars; fine-grained: github_pat_ + 22 + _ + 59.
    pattern:
      /(?<![A-Za-z0-9_])((?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59})(?![A-Za-z0-9_])/,
    secretGroup: 1,
    keywords: ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_', 'github_pat_'],
    confidence: 0.95,
    knownPrefixes: ['github_pat_', 'ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_'],
  },
  {
    id: 'aws-access-key-id',
    category: 'cloud-key',
    source: 'builtin',
    pattern: /(?<![A-Z0-9])((?:AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16})(?![A-Z0-9])/,
    secretGroup: 1,
    keywords: ['akia', 'asia', 'abia', 'acca'],
    confidence: 0.9,
    knownPrefixes: ['AKIA', 'ASIA', 'ABIA', 'ACCA'],
  },
  {
    id: 'aws-secret-access-key',
    category: 'cloud-key',
    source: 'builtin',
    pattern:
      /aws_?secret_?(?:access_?)?key["']?\s{0,4}(?:=|:|=>)\s{0,4}["']?([A-Za-z0-9/+]{40})(?![A-Za-z0-9/+=])/i,
    secretGroup: 1,
    keywords: ['aws'],
    confidence: 0.85,
    minEntropy: 3.5,
  },
  {
    id: 'google-api-key',
    category: 'cloud-key',
    source: 'builtin',
    pattern: /(?<![A-Za-z0-9_-])(AIza[0-9A-Za-z_-]{35})(?![A-Za-z0-9_-])/,
    secretGroup: 1,
    keywords: ['aiza'],
    confidence: 0.9,
    knownPrefixes: ['AIza'],
  },
  {
    id: 'stripe-live-key',
    category: 'payment-key',
    source: 'builtin',
    pattern: /(?<![A-Za-z0-9_])((?:sk|rk)_live_[0-9A-Za-z]{24,99})(?![A-Za-z0-9_])/,
    secretGroup: 1,
    keywords: ['sk_live_', 'rk_live_'],
    confidence: 0.95,
    knownPrefixes: ['sk_live_', 'rk_live_'],
  },
  {
    id: 'stripe-test-key',
    category: 'payment-key',
    source: 'builtin',
    pattern: /(?<![A-Za-z0-9_])((?:sk|rk)_test_[0-9A-Za-z]{24,99})(?![A-Za-z0-9_])/,
    secretGroup: 1,
    keywords: ['sk_test_', 'rk_test_'],
    // Test keys cannot move money but still expose the account's test data.
    confidence: 0.5,
    knownPrefixes: ['sk_test_', 'rk_test_'],
  },
  {
    id: 'slack-token',
    category: 'chat-token',
    source: 'builtin',
    pattern: /(?<![A-Za-z0-9-])(xox[abprs]-[0-9A-Za-z-]{10,250})(?![A-Za-z0-9-])/,
    secretGroup: 1,
    keywords: ['xox'],
    confidence: 0.9,
    knownPrefixes: ['xoxa-', 'xoxb-', 'xoxp-', 'xoxr-', 'xoxs-'],
  },
  {
    id: 'slack-webhook-url',
    category: 'chat-token',
    source: 'builtin',
    pattern:
      /https:\/\/hooks\.slack\.com\/services\/(T[A-Z0-9]{8,12}\/B[A-Z0-9]{8,12}\/[A-Za-z0-9]{24})/,
    secretGroup: 1,
    keywords: ['hooks.slack.com'],
    confidence: 0.85,
  },
  {
    id: 'jwt',
    category: 'jwt',
    source: 'builtin',
    pattern:
      /(?<![A-Za-z0-9_-])(eyJ[A-Za-z0-9_-]{10,2000}\.eyJ[A-Za-z0-9_-]{10,4000}\.[A-Za-z0-9_-]{10,2000})(?![A-Za-z0-9_-])/,
    secretGroup: 1,
    keywords: ['eyj'],
    // Often short-lived or test tokens, hence a moderate prior.
    confidence: 0.6,
    knownPrefixes: ['eyJ'],
  },
  {
    id: 'private-key',
    category: 'private-key',
    source: 'builtin',
    pattern:
      /-----BEGIN[ A-Z0-9]{0,30}PRIVATE KEY(?: BLOCK)?-----([\s\S]{20,16384}?)-----END[ A-Z0-9]{0,30}PRIVATE KEY(?: BLOCK)?-----/,
    secretGroup: 1,
    keywords: ['private key'],
    confidence: 0.95,
    multiline: true,
  },
  {
    id: 'postgres-uri',
    category: 'connection-string',
    source: 'builtin',
    // The secret is the password from the userinfo part: scheme://user:PASSWORD@host
    pattern: /\bpostgres(?:ql)?:\/\/[^:\s/@]{1,128}:([^@\s/]{1,128})@[^\s"'`]{1,256}/i,
    secretGroup: 1,
    keywords: ['postgres'],
    confidence: 0.75,
  },
  {
    id: 'mysql-uri',
    category: 'connection-string',
    source: 'builtin',
    pattern: /\b(?:mysql|mariadb)(?:x)?:\/\/[^:\s/@]{1,128}:([^@\s/]{1,128})@[^\s"'`]{1,256}/i,
    secretGroup: 1,
    keywords: ['mysql', 'mariadb'],
    confidence: 0.75,
  },
  {
    id: 'mongodb-uri',
    category: 'connection-string',
    source: 'builtin',
    pattern: /\bmongodb(?:\+srv)?:\/\/[^:\s/@]{1,128}:([^@\s/]{1,128})@[^\s"'`]{1,256}/i,
    secretGroup: 1,
    keywords: ['mongodb'],
    confidence: 0.75,
  },
  {
    id: 'sqlserver-connection-string',
    category: 'connection-string',
    source: 'builtin',
    // ADO.NET style: Server=...;Database=...;User Id=...;Password=...;
    pattern: /(?<![A-Za-z])(?:password|pwd)\s{0,4}=\s{0,4}([^;"'\s]{3,128})/i,
    secretGroup: 1,
    // Requires a server keyword on the same line, so plain `password=` lines go to the generic rule.
    keywords: ['server=', 'data source=', 'initial catalog='],
    confidence: 0.7,
  },
  {
    id: 'generic-secret-assignment',
    category: 'generic',
    source: 'builtin',
    // NAME = value, NAME: value, "name": "value", where NAME contains a secret-like keyword.
    pattern:
      /(?<![A-Za-z0-9_])[A-Za-z0-9_.-]{0,40}(?:secret|token|passw(?:or)?d|pwd|api[_-]?key|apikey|access[_-]?key|private[_-]?key|credential|auth[_-]?key)[A-Za-z0-9_.-]{0,40}["'`]?\s{0,4}(?::=|=>|=|:)\s{0,4}["'`]?([^\s"'`;,]{8,200})/i,
    secretGroup: 1,
    // 'key' covers api_key, apiKey, accessKey, privateKey, auth-key and so on.
    keywords: ['secret', 'token', 'passw', 'pwd', 'key', 'credential'],
    // Weak prior: the decision relies on entropy and context.
    confidence: 0.35,
    minEntropy: 2.5,
  },
];
