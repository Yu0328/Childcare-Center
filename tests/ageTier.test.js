import { describe, it, expect } from 'vitest';
import { calculateAgeInMonths, suggestTier } from '../src/domain/ageTier.js';

describe('calculateAgeInMonths', () => {
  it('returns 0 for a newborn on the same day', () => {
    expect(calculateAgeInMonths('2026-01-15', '2026-01-15')).toBe(0);
  });

  it('returns whole months elapsed', () => {
    expect(calculateAgeInMonths('2025-01-07', '2026-03-31')).toBe(14);
  });

  it('does not round up when the day-of-month has not been reached', () => {
    expect(calculateAgeInMonths('2025-01-20', '2026-03-05')).toBe(13);
  });
});

describe('suggestTier', () => {
  it('suggests Ⅰ for a 0-3 month old', () => {
    expect(suggestTier('2026-06-01', '2026-08-01')).toBe('Ⅰ');
  });

  it('suggests Ⅳ for a 13-18 month old (matches the 陳小安 sample)', () => {
    expect(suggestTier('2024-11-01', '2026-03-01')).toBe('Ⅳ');
  });

  it('suggests Ⅴ for a 19-24 month old (matches the 林小晴 sample: born 113.07.19, 19 months at 115.03)', () => {
    expect(suggestTier('2024-07-19', '2026-03-01')).toBe('Ⅴ');
  });

  it('suggests Ⅵ for a child older than 24 months', () => {
    expect(suggestTier('2023-01-01', '2026-03-01')).toBe('Ⅵ');
  });
});
