import { describe, it, expect } from 'vitest';
import { combinedPeriod, splitPeriodRange, periodSelectsHtml, currentRocYear } from '../src/ui/periodFields.js';

describe('combinedPeriod', () => {
  it('returns the single period when both arguments are the same', () => {
    expect(combinedPeriod('115年08月', '115年08月')).toBe('115年08月');
  });

  it('joins two different periods into an earlier-first range, regardless of argument order', () => {
    expect(combinedPeriod('115年02月', '114年09月')).toBe('114年09月-115年02月');
    expect(combinedPeriod('114年09月', '115年02月')).toBe('114年09月-115年02月');
  });
});

describe('splitPeriodRange', () => {
  it('returns the same value for both start and end when given a single period', () => {
    expect(splitPeriodRange('115年08月')).toEqual({ start: '115年08月', end: '115年08月' });
  });

  it('splits a range period at the dash', () => {
    expect(splitPeriodRange('114年09月-115年02月')).toEqual({ start: '114年09月', end: '115年02月' });
  });
});

describe('periodSelectsHtml', () => {
  it('選單範圍外的年份（例如匯入很舊的檔案）也會出現並被選取，不會變成明年', () => {
    const old = currentRocYear() - 10;
    const host = document.createElement('div');
    host.innerHTML = periodSelectsHtml({ yearFieldName: 'y', monthFieldName: 'm', selectedYear: old, selectedMonth: 3 });
    expect(host.querySelector('[data-field="y"]').value).toBe(String(old));
  });
});
