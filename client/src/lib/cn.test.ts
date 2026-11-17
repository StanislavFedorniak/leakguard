import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('skips falsy values', () => {
    expect(cn('px-2', false, undefined, 'py-1')).toBe('px-2 py-1');
  });

  it('keeps the last of conflicting Tailwind utilities', () => {
    expect(cn('px-2 text-sm', 'px-4')).toBe('text-sm px-4');
  });
});
