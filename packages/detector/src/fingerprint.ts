import type { SecretValue } from './secret-value.js';

/**
 * Turns a normalized secret into a stable identifier used as the deduplication key.
 *
 * Injected by the caller, because the engine has no access to platform crypto:
 * - server: HMAC-SHA256(secret, FINGERPRINT_PEPPER) via `node:crypto`. A plain hash of
 *   a short password could be reversed by brute force, a keyed hash cannot without the pepper;
 * - browser: `createLocalFingerprinter()`, enough for grouping within one page.
 *
 * Must be synchronous and deterministic.
 */
export type Fingerprinter = (normalizedSecret: string) => string;

/**
 * Brings different spellings of the same secret to one form, so they get one fingerprint:
 * surrounding whitespace is dropped, and multi-line values (PEM bodies) lose all
 * whitespace, since line wrapping differs between files.
 */
export function normalizeSecret(secret: string): string {
  return /[\r\n]/.test(secret) ? secret.replace(/\s+/g, '') : secret.trim();
}

export function fingerprintSecret(
  secret: SecretValue | string,
  fingerprinter: Fingerprinter,
): string {
  const raw = typeof secret === 'string' ? secret : secret.reveal();
  return fingerprinter(normalizeSecret(raw));
}

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

/**
 * FNV-1a 64-bit hash for client-side grouping in the "Check text" page.
 * NOT suitable for storage: it is fast and unkeyed, so short secrets can be brute-forced.
 */
export function createLocalFingerprinter(): Fingerprinter {
  return (value) => {
    let hash = FNV_OFFSET_BASIS;
    for (let i = 0; i < value.length; i++) {
      hash ^= BigInt(value.charCodeAt(i));
      hash = (hash * FNV_PRIME) & UINT64_MASK;
    }
    return `local:${hash.toString(16).padStart(16, '0')}`;
  };
}
