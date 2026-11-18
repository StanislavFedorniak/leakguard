/**
 * Deterministic generator of SYNTHETIC secrets in valid formats.
 *
 * No real or even format-complete token is written literally in the repository:
 * values are assembled at runtime from a seeded PRNG. This keeps GitHub push
 * protection, gitleaks and LeakGuard itself quiet on this repository, while the
 * tests still exercise realistic shapes. Every value starts with "FAKE" where
 * the format allows it.
 */

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
export const ALNUM = UPPER + LOWER + DIGITS;
const BASE32 = `${UPPER}234567`;
const BASE64 = `${ALNUM}+/`;
const BASE64URL = `${ALNUM}-_`;
const HEX = '0123456789abcdef';

/** Mulberry32: a tiny seeded PRNG, good enough for test data. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export class FakeSecrets {
  readonly #rng: () => number;

  constructor(seed = 42) {
    this.#rng = createRng(seed);
  }

  random(alphabet: string, length: number): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += alphabet[Math.floor(this.#rng() * alphabet.length)];
    }
    return result;
  }

  /** `FAKE` + random tail of the requested total length. */
  private fake(alphabet: string, length: number): string {
    return `FAKE${this.random(alphabet, length - 4)}`;
  }

  githubToken(kind: 'ghp' | 'gho' | 'ghu' | 'ghs' | 'ghr' = 'ghp'): string {
    return `${kind}_${this.fake(ALNUM, 36)}`;
  }

  githubFineGrainedToken(): string {
    return ['github', 'pat', this.fake(ALNUM, 22), this.random(ALNUM, 59)].join('_');
  }

  awsAccessKeyId(): string {
    return `AKIA${this.fake(BASE32, 16)}`;
  }

  awsSecretAccessKey(): string {
    return this.fake(BASE64, 40);
  }

  googleApiKey(): string {
    return `AIza${this.fake(BASE64URL, 35)}`;
  }

  stripeKey(mode: 'live' | 'test'): string {
    return ['sk', mode, this.fake(ALNUM, 32)].join('_');
  }

  slackToken(): string {
    return ['xoxb', this.random(DIGITS, 12), this.random(DIGITS, 13), this.fake(ALNUM, 24)].join(
      '-',
    );
  }

  slackWebhookUrl(): string {
    const team = `T${this.random(UPPER + DIGITS, 10)}`;
    const bot = `B${this.random(UPPER + DIGITS, 10)}`;
    return `https://hooks.slack.com/services/${team}/${bot}/${this.fake(ALNUM, 24)}`;
  }

  jwt(): string {
    // Shape only: "eyJ" is the base64url encoding of '{"'.
    return [
      `eyJ${this.random(BASE64URL, 33)}`,
      `eyJ${this.random(BASE64URL, 60)}`,
      this.random(BASE64URL, 43),
    ].join('.');
  }

  privateKeyBlock(type = 'RSA'): string {
    const lines: string[] = [];
    for (let i = 0; i < 6; i++) {
      lines.push(this.random(BASE64, 64));
    }
    const label = `${type} PRIVATE KEY`;
    return [`-----BEGIN ${label}-----`, ...lines, `-----END ${label}-----`].join('\n');
  }

  password(length = 20): string {
    return this.random(`${ALNUM}!@#%^&*`, length);
  }

  hex(length: number): string {
    return this.random(HEX, length);
  }

  uuid(): string {
    const h = (n: number): string => this.hex(n);
    return `${h(8)}-${h(4)}-4${h(3)}-a${h(3)}-${h(12)}`;
  }
}
