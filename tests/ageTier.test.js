import { describe, it, expect } from 'vitest';
import { calculateAgeInMonths, suggestTier, todayIsoDate } from '../src/domain/ageTier.js';

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

describe('todayIsoDate', () => {
  it("uses the device's local date, not UTC (07:30 in Taiwan is still the previous day in UTC)", () => {
    // Local-time constructor, so this is 07:30 wherever the test runs; the helper must echo the local calendar date.
    expect(todayIsoDate(new Date(2026, 8, 25, 7, 30))).toBe('2026-09-25');
    expect(todayIsoDate(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });
});
