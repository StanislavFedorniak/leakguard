import { describe, expect, it } from 'vitest';
import { NodeEnv, validateEnv } from './env.validation.js';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/leakguard',
  REDIS_URL: 'redis://:pass@localhost:6379',
};

describe('validateEnv', () => {
  it('applies defaults and converts types', () => {
    const env = validateEnv({ ...validEnv, PORT: '4000' });

    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe(NodeEnv.Development);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateEnv({ REDIS_URL: validEnv.REDIS_URL })).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-redis REDIS_URL', () => {
    expect(() => validateEnv({ ...validEnv, REDIS_URL: 'http://localhost' })).toThrow(/REDIS_URL/);
  });

  it('does not leak variable values in error messages', () => {
    const secretUrl = 'mysql://user:super-secret@localhost/db';

    expect(() => validateEnv({ ...validEnv, DATABASE_URL: secretUrl })).toThrow(
      expect.not.stringContaining('super-secret'),
    );
  });
});
