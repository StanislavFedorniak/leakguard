# @leakguard/detector

Platform-neutral secret detection engine used by the LeakGuard scan worker (Node.js)
and by the client-side "Check text" page (browser). It has no Node.js or DOM
dependencies: the TypeScript config compiles it with `types: []`.

## Usage

```ts
import { createDetector } from '@leakguard/detector';

const detector = createDetector({ disabledRuleIds: ['stripe-test-key'] });
const { detections, skipped } = detector.scan({ path: '.env', content });

for (const d of detections) {
  console.log(d.ruleId, d.severity, d.line, d.column, d.maskedPreview);
  // d.secret is a SecretValue: it serializes as "[REDACTED]".
  // Call d.secret.reveal() only to compute a fingerprint.
}
```

`scanText(input, options)` is a shortcut for one-off scans.

## Pipeline

1. **Pre-checks:** skip default-ignored paths (`node_modules/`, `vendor/`, `dist/`,
   `build/`, lock files), inputs over `maxContentLength` (1 MiB) and binary content
   (a NUL byte in the first 8 KiB).
2. **Keyword pre-filter:** a rule runs only if one of its lower-case keywords occurs
   in the file and then in the line.
3. **Matching:** single-line rules run line by line, and lines over `maxLineLength`
   (4096) are skipped. Multi-line rules (PEM keys) run on the whole content.
4. **Signals** (each in `[0, 1]`): rule confidence, normalized Shannon entropy,
   sensitive path, secret-like keyword before the value, test/example path, placeholder.
5. **Scoring:** `score = clamp(Σ wᵢ·sᵢ, 0, 1)`, mapped to `low / medium / high / critical`
   by thresholds. Detections below `minScore` are dropped.
6. **Overlap resolution:** greedy selection by descending score, so a specific rule wins
   over `generic-secret-assignment` on the same value.

### Entropy

`H = −Σ pᵢ·log₂(pᵢ)`, normalized per charset (hex, base64, other):
`s = clamp((H − H_min) / (H_max − H_min))`, where `H_max = log₂(min(|alphabet|, length))`
and `H_min = floorRatio · H_max`.

### Default weights

| Signal         | Weight |
| -------------- | ------ |
| ruleConfidence | 0.70   |
| entropy        | 0.25   |
| sensitivePath  | 0.15   |
| keyword        | 0.15   |
| testPath       | −0.35  |
| placeholder    | −0.80  |

Thresholds: medium ≥ 0.45, high ≥ 0.65, critical ≥ 0.85; `minScore` = 0.3.
These are starting values that are calibrated on a labeled corpus.

## Built-in rules

| Id                                           | Detects                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| `github-token`                               | GitHub classic (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`) and fine-grained tokens |
| `aws-access-key-id`                          | AWS access key IDs (`AKIA…`, `ASIA…`)                                           |
| `aws-secret-access-key`                      | AWS secret access keys next to an `aws_secret_access_key` label                 |
| `google-api-key`                             | Google API keys (`AIza…`)                                                       |
| `stripe-live-key` / `stripe-test-key`        | Stripe secret and restricted keys                                               |
| `slack-token` / `slack-webhook-url`          | Slack tokens (`xox?-…`) and incoming webhooks                                   |
| `jwt`                                        | JSON Web Tokens                                                                 |
| `private-key`                                | PEM private keys (RSA, EC, DSA, OpenSSH, PGP)                                   |
| `postgres-uri` / `mysql-uri` / `mongodb-uri` | Passwords in connection URIs                                                    |
| `sqlserver-connection-string`                | `Password=` in ADO.NET connection strings                                       |
| `generic-secret-assignment`                  | `password = …`, `"apiKey": "…"` and similar assignments                         |

Custom rules are validated by `compileCustomRule`, which rejects invalid syntax,
patterns that match the empty string, and patterns prone to catastrophic
backtracking (nested quantifiers, backreferences).

## Tests

```sh
npm test -w @leakguard/detector
npm run test:cov -w @leakguard/detector   # coverage thresholds: 90 %
```

Tests use only synthetic secrets generated at runtime from a seeded PRNG
(`test/helpers/fake-secrets.ts`), so no token-shaped literal exists in the repository.
