import { describe, expect, it } from 'vitest';
import { detectCharset, entropySignal, maxEntropy, shannonEntropy } from '../src/entropy.js';
import { FakeSecrets } from './helpers/fake-secrets.js';

describe('shannonEntropy', () => {
  it.each([
    ['', 0],
    ['aaaa', 0],
    ['ab', 1],
    ['abcd', 2],
    ['aabb', 1],
    ['0123456789abcdef', 4],
  ])('H(%j) = %d', (value, expected) => {
    expect(shannonEntropy(value)).toBeCloseTo(expected, 10);
  });

  it('counts code points, not UTF-16 units', () => {
    expect(shannonEntropy('😀😀')).toBe(0);
  });
});

describe('detectCharset', () => {
  it.each([
    ['deadBEEF01', 'hex'],
    ['QWxhZGRpbjpvcGVu+/=', 'base64'],
    ['abc-def_ghi', 'base64'],
    ['p@ss w0rd!', 'other'],
  ] as const)('%s → %s', (value, charset) => {
    expect(detectCharset(value)).toBe(charset);
  });
});

describe('maxEntropy', () => {
  it('is bounded by the alphabet size', () => {
    expect(maxEntropy(1000, 'hex')).toBe(4);
    expect(maxEntropy(1000, 'base64')).toBe(6);
  });

  it('is bounded by the length for short strings', () => {
    expect(maxEntropy(8, 'base64')).toBe(3);
    expect(maxEntropy(1, 'other')).toBe(0);
  });
});

describe('entropySignal', () => {
  const fake = new FakeSecrets(1);

  it('is high for random hex and base64', () => {
    expect(entropySignal(fake.hex(40))).toBeGreaterThan(0.7);
    expect(entropySignal(fake.awsSecretAccessKey())).toBeGreaterThan(0.7);
  });

  it('is zero for repeated characters and single characters', () => {
    expect(entropySignal('aaaaaaaaaaaaaaaa')).toBe(0);
    expect(entropySignal('a')).toBe(0);
    expect(entropySignal('')).toBe(0);
  });

  it('ignores whitespace inside multi-line values', () => {
    const value = fake.random('abcdefghijklmnop', 64);
    const wrapped = `${value.slice(0, 32)}\n  ${value.slice(32)}`;
    expect(entropySignal(wrapped)).toBe(entropySignal(value));
  });

  it('stays within [0, 1]', () => {
    for (let i = 0; i < 50; i++) {
      const signal = entropySignal(fake.password(5 + i));
      expect(signal).toBeGreaterThanOrEqual(0);
      expect(signal).toBeLessThanOrEqual(1);
    }
  });
});
