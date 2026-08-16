import { describe, it, expect } from 'vitest';
import { combinedPeriod } from '../src/ui/periodFields.js';

describe('combinedPeriod', () => {
  it('returns the single period when both arguments are the same', () => {
    expect(combinedPeriod('115年08月', '115年08月')).toBe('115年08月');
  });

  it('joins two different periods into an earlier-first range, regardless of argument order', () => {
    expect(combinedPeriod('115年02月', '114年09月')).toBe('114年09月-115年02月');
    expect(combinedPeriod('114年09月', '115年02月')).toBe('114年09月-115年02月');
  });
});
