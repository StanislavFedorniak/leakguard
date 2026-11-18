import { clamp } from './math.js';

export type Charset = 'hex' | 'base64' | 'other';

/** Alphabet size used as the upper bound of entropy for each charset. */
const ALPHABET_SIZE: Readonly<Record<Charset, number>> = {
  hex: 16,
  base64: 64,
  // Printable ASCII without the space.
  other: 94,
};

/**
 * Share of the maximum entropy below which a string is considered non-random.
 * Hex strings have a small alphabet, so they need a higher share to look random.
 */
export const ENTROPY_FLOOR_RATIO: Readonly<Record<Charset, number>> = {
  hex: 0.6,
  base64: 0.55,
  other: 0.5,
};

const HEX = /^[0-9a-f]+$/i;
const BASE64 = /^[A-Za-z0-9+/=_-]+$/;

/**
 * Shannon entropy in bits per character: H = −Σ pᵢ·log₂(pᵢ),
 * where pᵢ is the relative frequency of the i-th distinct character.
 */
export function shannonEntropy(value: string): number {
  const counts = new Map<string, number>();
  let length = 0;
  for (const char of value) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
    length++;
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export function detectCharset(value: string): Charset {
  if (HEX.test(value)) {
    return 'hex';
  }
  if (BASE64.test(value)) {
    return 'base64';
  }
  return 'other';
}

/**
 * Maximum achievable entropy for a string of this length over this charset:
 * H_max = log₂(min(|alphabet|, length)). A short string cannot use the whole alphabet.
 */
export function maxEntropy(length: number, charset: Charset): number {
  const distinct = Math.min(ALPHABET_SIZE[charset], length);
  return distinct > 1 ? Math.log2(distinct) : 0;
}

/**
 * Entropy normalized to [0, 1]:
 * s = clamp((H − H_min) / (H_max − H_min)), where H_min = floorRatio · H_max.
 * Whitespace is ignored so that multi-line values (PEM bodies) are measured fairly.
 */
export function entropySignal(value: string): number {
  const compact = value.replace(/\s+/g, '');
  const charset = detectCharset(compact);
  const hMax = maxEntropy(Array.from(compact).length, charset);
  if (hMax === 0) {
    return 0;
  }
  const hMin = ENTROPY_FLOOR_RATIO[charset] * hMax;
  return clamp((shannonEntropy(compact) - hMin) / (hMax - hMin));
}
