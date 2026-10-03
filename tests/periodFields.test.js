import { describe, it, expect } from 'vitest';
import { combinedPeriod, splitPeriodRange, periodSelectsHtml, currentRocYear, defaultDateInPeriod, periodDateBounds } from '../src/ui/periodFields.js';

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

describe('defaultDateInPeriod', () => {
  it('今天就在紀錄的月份裡：預設今天', () => {
    expect(defaultDateInPeriod('115年10月', '2026-10-15')).toBe('2026-10-15');
  });
  it('今天不在紀錄的月份（補做 10 月、現在已經 11 月）：預設那個月的 1 號，不是今天', () => {
    expect(defaultDateInPeriod('115年10月', '2026-11-03')).toBe('2026-10-01');
  });
  it('跨月的實施時間：今天在範圍內用今天，不在就用最後一個月的 1 號', () => {
    expect(defaultDateInPeriod('114年09月-115年02月', '2026-01-20')).toBe('2026-01-20');
    expect(defaultDateInPeriod('114年09月-115年02月', '2026-05-01')).toBe('2026-02-01');
  });
  it('看不懂的實施時間：留白，維持原本的行為', () => {
    expect(defaultDateInPeriod('', '2026-10-15')).toBe('');
  });
});

describe('periodDateBounds', () => {
  it('回傳實施時間第一天和最後一天', () => {
    expect(periodDateBounds('115年02月')).toEqual({ min: '2026-02-01', max: '2026-02-28' });
    expect(periodDateBounds('114年09月-115年02月')).toEqual({ min: '2025-09-01', max: '2026-02-28' });
    expect(periodDateBounds('')).toBeNull();
  });
});
