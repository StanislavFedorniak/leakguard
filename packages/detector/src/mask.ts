const MASK = '****';

/**
 * Builds a preview that is safe to store and display.
 *
 * Only a known public prefix (e.g. `ghp_`) and a short tail survive, so the
 * preview helps a user recognise the key without exposing it:
 * fewer than 12 characters → `****`; fewer than 20 → 2 last characters; otherwise 4.
 */
export function maskSecret(secret: string, knownPrefixes: readonly string[] = []): string {
  const compact = secret.replace(/\s+/g, '');
  if (compact.length < 12) {
    return MASK;
  }
  const prefix = knownPrefixes.find((candidate) => compact.startsWith(candidate)) ?? '';
  const tailLength = compact.length < 20 ? 2 : 4;
  return `${prefix}${MASK}${compact.slice(-tailLength)}`;
}
